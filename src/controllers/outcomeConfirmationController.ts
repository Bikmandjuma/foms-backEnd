import type { Request, Response } from "express";
import { requireTenantId } from "../middleware/auth.js";
import { ApiError } from "../middleware/errorHandler.js";
import { sendResponse } from "../utils/apiResponse.js";
import { prisma } from "../utils/prisma.js";
import { confirmFieldVisitOutcomeSchema } from "../utils/validators.js";
import { recordActivity } from "../utils/activityLog.js";
import { notifyUser } from "../utils/notifications.js";

function idParam(req: Request): string {
  return req.params.id as string;
}

const pendingInclude = {
  beneficiary: {
    select: {
      id: true,
      code: true,
      name: true,
      programs: { select: { id: true, name: true } },
    },
  },
  checkIn: {
    select: {
      id: true,
      userId: true,
      user: { select: { id: true, name: true, email: true } },
      project: { select: { id: true, name: true } },
    },
  },
} as const;

/**
 * GET /outcome-confirmations?programId=&userId= — every FieldVisit still
 * awaiting supervisor sign-off, oldest first. This is the supervisor's
 * mobile queue: same self-contained "list what's left" shape as
 * getNextAvailabilityCheck, but a supervisor works through the whole
 * tenant-wide queue rather than a personal assignment, so it's permission
 * gated (outcomes:view) rather than scoped to req.user.
 */
export async function listPendingOutcomeConfirmations(req: Request, res: Response): Promise<void> {
  const tenantId = requireTenantId(req);
  const { programId, userId } = req.query;

  const visits = await prisma.fieldVisit.findMany({
    where: {
      confirmationStatus: "PENDING",
      checkIn: {
        tenantId,
        ...(typeof userId === "string" && userId ? { userId } : {}),
        ...(typeof programId === "string" && programId ? { projectId: programId } : {}),
      },
    },
    include: pendingInclude,
    orderBy: { recordedAt: "asc" },
  });

  sendResponse(res, 200, "Pending outcome confirmations retrieved successfully", {
    total: visits.length,
    visits,
  });
}

/**
 * PUT /outcome-confirmations/:id — a supervisor confirms or rejects one
 * enumerator-recorded outcome. Guarded on confirmationStatus already being
 * PENDING (409 otherwise) so the same visit can't be reviewed twice — once
 * decided, it's off the pending queue for good; a wrong call gets corrected
 * by recording a fresh visit, not by re-reviewing this one.
 */
export async function confirmVisitOutcome(req: Request, res: Response): Promise<void> {
  const data = confirmFieldVisitOutcomeSchema.parse(req.body);
  const tenantId = requireTenantId(req);

  const visit = await prisma.fieldVisit.findFirst({
    where: { id: idParam(req), checkIn: { tenantId } },
    include: pendingInclude,
  });
  if (!visit) throw new ApiError(404, "Field visit not found");
  if (visit.confirmationStatus !== "PENDING") {
    throw new ApiError(409, "This outcome has already been reviewed");
  }

  const updated = await prisma.fieldVisit.update({
    where: { id: visit.id },
    data: {
      confirmationStatus: data.status,
      confirmedById: req.user!.sub,
      confirmedAt: new Date(),
      rejectionReason: data.status === "REJECTED" ? data.reason : null,
    },
    include: pendingInclude,
  });

  await recordActivity({
    tenantId,
    userId: req.user!.sub,
    action: data.status === "CONFIRMED" ? "confirmed outcome for" : "rejected outcome for",
    entityType: "FieldVisit",
    entityId: visit.id,
    metadata: { beneficiary: visit.beneficiary.name, outcome: visit.outcome, reason: data.reason },
  });

  await notifyUser({
    tenantId,
    userId: visit.checkIn.userId,
    type: "OUTCOME_REVIEWED",
    message:
      data.status === "CONFIRMED"
        ? `Your recorded outcome for ${visit.beneficiary.name} was confirmed`
        : `Your recorded outcome for ${visit.beneficiary.name} was rejected${data.reason ? `: ${data.reason}` : ""}`,
    entityType: "FieldVisit",
    entityId: visit.id,
  });

  sendResponse(res, 200, "Outcome reviewed successfully", updated);
}

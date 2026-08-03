import type { Request, Response } from "express";
import { z } from "zod";
import { requireTenantId } from "../middleware/auth.js";
import { ApiError } from "../middleware/errorHandler.js";
import { sendResponse } from "../utils/apiResponse.js";
import { prisma } from "../utils/prisma.js";
import { recordActivity } from "../utils/activityLog.js";
import { notifyUser } from "../utils/notifications.js";
import { decideReplacementSchema } from "../utils/validators.js";
import { computeMatchLevel, matchLevelLabel, rankMatchLevel } from "../utils/geo.js";

const include = {
  originalRespondent: { select: { id: true, name: true, code: true } },
  candidateRespondent: { select: { id: true, name: true, code: true } },
  requestedBy: { select: { id: true, name: true, email: true } },
  decidedBy: { select: { id: true, name: true, email: true } },
} as const;

const createSchema = z.object({
  originalRespondentId: z.string().uuid(),
  reason: z.string().min(1),
  candidateRespondentId: z.string().uuid().optional(),
});

function idParam(req: Request): string {
  return req.params.id as string;
}

// Anyone tenant-scoped with replacements:manage above supervisor level
// should receive the notification; in the absence of a formal "approver"
// role field we notify every user in the tenant whose role has
// replacements:manage, which the frontend/admin can tune via Roles.
async function notifyApprovers(tenantId: string, message: string, entityId: string): Promise<void> {
  const roles = await prisma.role.findMany({ where: { tenantId }, select: { id: true, permissions: true } });
  const approverRoleIds = roles
    .filter((r) => Array.isArray(r.permissions) && (r.permissions as string[]).includes("replacements:manage"))
    .map((r) => r.id);
  if (approverRoleIds.length === 0) return;

  const approvers = await prisma.user.findMany({
    where: { tenantId, roleId: { in: approverRoleIds } },
    select: { id: true },
  });

  await Promise.all(
    approvers.map((a) =>
      notifyUser({
        tenantId,
        userId: a.id,
        type: "REPLACEMENT_REQUESTED",
        message,
        entityType: "ReplacementRequest",
        entityId,
      })
    )
  );
}

export async function listReplacementRequests(req: Request, res: Response): Promise<void> {
  const tenantId = requireTenantId(req);
  const { status } = req.query;
  const requests = await prisma.replacementRequest.findMany({
    where: {
      tenantId,
      ...(status === "PENDING" || status === "APPROVED" || status === "REJECTED" ? { status } : {}),
    },
    include,
    orderBy: { createdAt: "desc" },
  });
  sendResponse(res, 200, "Replacement requests retrieved successfully", requests);
}

/**
 * Ranked replacement candidates for a given original respondent, searching
 * outward through the geographic hierarchy — village, then cell, then
 * sector, then district, then province (PRD FR-7). Only PENDING-outcome
 * respondents without an active assignment are considered "available" —
 * i.e. spare/reserve respondents, not someone already someone else's
 * fieldwork target.
 */
export async function getReplacementCandidates(req: Request, res: Response): Promise<void> {
  const tenantId = requireTenantId(req);
  const originalRespondentId = req.query.originalRespondentId;
  if (typeof originalRespondentId !== "string" || !originalRespondentId) {
    throw new ApiError(400, "originalRespondentId query parameter is required");
  }

  const original = await prisma.beneficiary.findFirst({ where: { id: originalRespondentId, tenantId } });
  if (!original) throw new ApiError(404, "Original respondent not found");

  const pool = await prisma.beneficiary.findMany({
    where: {
      tenantId,
      id: { not: original.id },
      outcome: "PENDING",
      assignments: { none: { status: "ACTIVE" } },
    },
    select: {
      id: true,
      code: true,
      name: true,
      province: true,
      district: true,
      sector: true,
      cell: true,
      village: true,
    },
    take: 500,
  });

  const ranked = pool
    .map((candidate) => {
      const level = computeMatchLevel(original, candidate);
      return {
        beneficiary: candidate,
        matchLevel: level,
        matchLabel: matchLevelLabel(level),
        rank: rankMatchLevel(level),
      };
    })
    .sort((a, b) => a.rank - b.rank)
    .slice(0, 15);

  sendResponse(res, 200, "Replacement candidates retrieved successfully", {
    original: { id: original.id, code: original.code, name: original.name },
    candidates: ranked,
  });
}

export async function createReplacementRequest(req: Request, res: Response): Promise<void> {
  const data = createSchema.parse(req.body);
  const tenantId = requireTenantId(req);

  const original = await prisma.beneficiary.findFirst({ where: { id: data.originalRespondentId, tenantId } });
  if (!original) throw new ApiError(400, "originalRespondentId does not belong to your tenant");

  const request = await prisma.replacementRequest.create({
    data: {
      reason: data.reason,
      tenantId,
      originalRespondentId: data.originalRespondentId,
      candidateRespondentId: data.candidateRespondentId,
      requestedByUserId: req.user!.sub,
    },
    include,
  });

  await recordActivity({
    tenantId,
    userId: req.user!.sub,
    action: "created",
    entityType: "ReplacementRequest",
    entityId: request.id,
    metadata: { originalRespondent: original.name },
  });

  await notifyApprovers(tenantId, `New replacement request for ${original.name} needs your review`, request.id);

  sendResponse(res, 201, "Replacement request created successfully", request);
}

export async function decideReplacementRequest(req: Request, res: Response): Promise<void> {
  const data = decideReplacementSchema.parse(req.body);
  const tenantId = requireTenantId(req);

  const existing = await prisma.replacementRequest.findFirst({
    where: { id: idParam(req), tenantId },
    include: { originalRespondent: true },
  });
  if (!existing) throw new ApiError(404, "Replacement request not found");
  if (existing.status !== "PENDING") throw new ApiError(409, "This request has already been decided");

  const candidateRespondentId = data.candidateRespondentId ?? existing.candidateRespondentId ?? undefined;

  if (data.status === "APPROVED" && !candidateRespondentId) {
    throw new ApiError(400, "candidateRespondentId is required to approve a replacement");
  }

  let matchLevel: "VILLAGE" | "CELL" | "SECTOR" | "DISTRICT" | "PROVINCE" | "OVERRIDE" | null = null;
  if (data.status === "APPROVED" && candidateRespondentId) {
    const candidate = await prisma.beneficiary.findFirst({ where: { id: candidateRespondentId, tenantId } });
    if (!candidate) throw new ApiError(400, "candidateRespondentId does not belong to your tenant");

    const computed = computeMatchLevel(existing.originalRespondent, candidate);
    if (computed === null) {
      // No overlap anywhere in the hierarchy, not even province — this is
      // exactly the case the PRD calls out: "Only if nothing exists should
      // an administrator override this rule with a recorded justification."
      if (!data.overrideReason) {
        throw new ApiError(
          400,
          "This candidate shares no location with the original respondent. Provide overrideReason to proceed anyway."
        );
      }
      matchLevel = "OVERRIDE";
    } else {
      matchLevel = computed;
    }
  }

  const request = await prisma.replacementRequest.update({
    where: { id: existing.id },
    data: {
      status: data.status,
      decidedAt: new Date(),
      decidedByUserId: req.user!.sub,
      candidateRespondentId,
      matchLevel,
      overrideReason: matchLevel === "OVERRIDE" ? data.overrideReason : null,
    },
    include,
  });

  if (data.status === "APPROVED") {
    await prisma.beneficiary.update({
      where: { id: request.originalRespondentId },
      data: { outcome: "REPLACED" },
    });
  }

  await recordActivity({
    tenantId,
    userId: req.user!.sub,
    action: data.status === "APPROVED" ? "approved" : "rejected",
    entityType: "ReplacementRequest",
    entityId: request.id,
    metadata: matchLevel ? { matchLevel } : undefined,
  });

  await notifyUser({
    tenantId,
    userId: request.requestedByUserId,
    type: "REPLACEMENT_DECIDED",
    message: `Your replacement request for ${request.originalRespondent.name} was ${data.status.toLowerCase()}`,
    entityType: "ReplacementRequest",
    entityId: request.id,
  });

  sendResponse(res, 200, "Replacement request decided successfully", request);
}

export async function deleteReplacementRequest(req: Request, res: Response): Promise<void> {
  const tenantId = requireTenantId(req);
  const existing = await prisma.replacementRequest.findFirst({ where: { id: idParam(req), tenantId } });
  if (!existing) throw new ApiError(404, "Replacement request not found");

  await prisma.replacementRequest.delete({ where: { id: existing.id } });
  sendResponse(res, 200, "Replacement request deleted successfully", null);
}

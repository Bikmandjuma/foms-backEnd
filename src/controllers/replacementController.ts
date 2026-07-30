import type { Request, Response } from "express";
import { z } from "zod";
import { requireTenantId } from "../middleware/auth.js";
import { ApiError } from "../middleware/errorHandler.js";
import { sendResponse } from "../utils/apiResponse.js";
import { prisma } from "../utils/prisma.js";
import { recordActivity } from "../utils/activityLog.js";
import { notifyUser } from "../utils/notifications.js";

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

const decideSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED"]),
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
  const data = decideSchema.parse(req.body);
  const tenantId = requireTenantId(req);

  const existing = await prisma.replacementRequest.findFirst({ where: { id: idParam(req), tenantId } });
  if (!existing) throw new ApiError(404, "Replacement request not found");
  if (existing.status !== "PENDING") throw new ApiError(409, "This request has already been decided");

  if (data.status === "APPROVED" && !data.candidateRespondentId && !existing.candidateRespondentId) {
    throw new ApiError(400, "candidateRespondentId is required to approve a replacement");
  }

  const request = await prisma.replacementRequest.update({
    where: { id: existing.id },
    data: {
      status: data.status,
      decidedAt: new Date(),
      decidedByUserId: req.user!.sub,
      candidateRespondentId: data.candidateRespondentId ?? existing.candidateRespondentId,
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

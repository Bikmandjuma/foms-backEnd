import type { Request, Response } from "express";
import { requireTenantId } from "../middleware/auth.js";
import { ApiError } from "../middleware/errorHandler.js";
import { sendResponse } from "../utils/apiResponse.js";
import { prisma } from "../utils/prisma.js";
import { createBeneficiaryAssignmentSchema } from "../utils/validators.js";
import { recordActivity } from "../utils/activityLog.js";
import { notifyUser } from "../utils/notifications.js";

const assignmentInclude = {
  user: { select: { id: true, name: true, email: true } },
  beneficiary: { select: { id: true, code: true, name: true } },
} as const;

function idParam(req: Request): string {
  return req.params.id as string;
}

export async function listBeneficiaryAssignments(req: Request, res: Response): Promise<void> {
  const tenantId = requireTenantId(req);
  const { userId, beneficiaryId, status } = req.query;

  const assignments = await prisma.beneficiaryAssignment.findMany({
    where: {
      tenantId,
      ...(typeof userId === "string" ? { userId } : {}),
      ...(typeof beneficiaryId === "string" ? { beneficiaryId } : {}),
      ...(status === "ACTIVE" || status === "ENDED" ? { status } : {}),
    },
    include: assignmentInclude,
    orderBy: { assignedAt: "desc" },
  });

  sendResponse(res, 200, "Beneficiary assignments retrieved successfully", assignments);
}

export async function createBeneficiaryAssignment(req: Request, res: Response): Promise<void> {
  const data = createBeneficiaryAssignmentSchema.parse(req.body);
  const tenantId = requireTenantId(req);

  const [beneficiary, user] = await Promise.all([
    prisma.beneficiary.findFirst({ where: { id: data.beneficiaryId, tenantId } }),
    prisma.user.findFirst({ where: { id: data.userId, tenantId } }),
  ]);
  if (!beneficiary) throw new ApiError(400, "beneficiaryId does not belong to your tenant");
  if (!user) throw new ApiError(400, "userId does not belong to your tenant");

  const existing = await prisma.beneficiaryAssignment.findFirst({
    where: { beneficiaryId: data.beneficiaryId, userId: data.userId, status: "ACTIVE" },
  });
  if (existing) throw new ApiError(409, "This beneficiary is already actively assigned to this user");

  const assignment = await prisma.beneficiaryAssignment.create({
    data: { ...data, tenantId },
    include: assignmentInclude,
  });

  await recordActivity({
    tenantId,
    userId: req.user!.sub,
    action: "assigned",
    entityType: "BeneficiaryAssignment",
    entityId: assignment.id,
    metadata: { user: assignment.user.name ?? assignment.user.email, beneficiary: assignment.beneficiary.name },
  });

  await notifyUser({
    tenantId,
    userId: assignment.userId,
    type: "ASSIGNMENT_BENEFICIARY",
    message: `You've been assigned as caseworker for ${assignment.beneficiary.name} (${assignment.beneficiary.code})`,
    entityType: "Beneficiary",
    entityId: assignment.beneficiaryId,
  });

  sendResponse(res, 201, "Beneficiary assignment created successfully", assignment);
}

export async function endBeneficiaryAssignment(req: Request, res: Response): Promise<void> {
  const existing = await prisma.beneficiaryAssignment.findFirst({
    where: { id: idParam(req), tenantId: requireTenantId(req) },
  });
  if (!existing) throw new ApiError(404, "Beneficiary assignment not found");

  const assignment = await prisma.beneficiaryAssignment.update({
    where: { id: existing.id },
    data: { status: "ENDED", endedAt: new Date() },
    include: assignmentInclude,
  });

  sendResponse(res, 200, "Beneficiary assignment ended successfully", assignment);
}

export async function deleteBeneficiaryAssignment(req: Request, res: Response): Promise<void> {
  const existing = await prisma.beneficiaryAssignment.findFirst({
    where: { id: idParam(req), tenantId: requireTenantId(req) },
  });
  if (!existing) throw new ApiError(404, "Beneficiary assignment not found");

  await prisma.beneficiaryAssignment.delete({ where: { id: existing.id } });
  sendResponse(res, 200, "Beneficiary assignment deleted successfully", null);
}

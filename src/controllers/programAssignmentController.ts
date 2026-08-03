import type { Request, Response } from "express";
import { requireTenantId } from "../middleware/auth.js";
import { ApiError } from "../middleware/errorHandler.js";
import { sendResponse } from "../utils/apiResponse.js";
import { prisma } from "../utils/prisma.js";
import { bulkProgramAssignmentSchema, createProgramAssignmentSchema } from "../utils/validators.js";
import { recordActivity } from "../utils/activityLog.js";
import { notifyUser } from "../utils/notifications.js";

const assignmentInclude = {
  user: { select: { id: true, name: true, email: true } },
  program: { select: { id: true, name: true } },
} as const;

function idParam(req: Request): string {
  return req.params.id as string;
}

export async function listProgramAssignments(req: Request, res: Response): Promise<void> {
  const tenantId = requireTenantId(req);
  const { userId, programId, status } = req.query;

  const assignments = await prisma.programAssignment.findMany({
    where: {
      tenantId,
      ...(typeof userId === "string" ? { userId } : {}),
      ...(typeof programId === "string" ? { programId } : {}),
      ...(status === "ACTIVE" || status === "ENDED" ? { status } : {}),
    },
    include: assignmentInclude,
    orderBy: { assignedAt: "desc" },
  });

  sendResponse(res, 200, "Program assignments retrieved successfully", assignments);
}

export async function createProgramAssignment(req: Request, res: Response): Promise<void> {
  const data = createProgramAssignmentSchema.parse(req.body);
  const tenantId = requireTenantId(req);

  const [user, program] = await Promise.all([
    prisma.user.findFirst({ where: { id: data.userId, tenantId } }),
    prisma.program.findFirst({ where: { id: data.programId, tenantId } }),
  ]);
  if (!user) throw new ApiError(400, "userId does not belong to your tenant");
  if (!program) throw new ApiError(400, "programId does not belong to your tenant");

  const existing = await prisma.programAssignment.findFirst({
    where: { userId: data.userId, programId: data.programId, status: "ACTIVE" },
  });
  if (existing) throw new ApiError(409, "This user is already actively assigned to this program");

  const assignment = await prisma.programAssignment.create({
    data: { ...data, tenantId },
    include: assignmentInclude,
  });

  await recordActivity({
    tenantId,
    userId: req.user!.sub,
    action: "assigned",
    entityType: "ProgramAssignment",
    entityId: assignment.id,
    metadata: { user: assignment.user.name ?? assignment.user.email, program: assignment.program.name },
  });

  await notifyUser({
    tenantId,
    userId: assignment.userId,
    type: "ASSIGNMENT_PROGRAM",
    message: `You've been assigned to the program "${assignment.program.name}"`,
    entityType: "Program",
    entityId: assignment.programId,
  });

  sendResponse(res, 201, "Program assignment created successfully", assignment);
}

export async function endProgramAssignment(req: Request, res: Response): Promise<void> {
  const existing = await prisma.programAssignment.findFirst({
    where: { id: idParam(req), tenantId: requireTenantId(req) },
  });
  if (!existing) throw new ApiError(404, "Program assignment not found");

  const assignment = await prisma.programAssignment.update({
    where: { id: existing.id },
    data: { status: "ENDED", endedAt: new Date() },
    include: assignmentInclude,
  });

  sendResponse(res, 200, "Program assignment ended successfully", assignment);
}

export async function deleteProgramAssignment(req: Request, res: Response): Promise<void> {
  const existing = await prisma.programAssignment.findFirst({
    where: { id: idParam(req), tenantId: requireTenantId(req) },
  });
  if (!existing) throw new ApiError(404, "Program assignment not found");

  await prisma.programAssignment.delete({ where: { id: existing.id } });
  sendResponse(res, 200, "Program assignment deleted successfully", null);
}

/**
 * Assign many users to one program in a single action ("add option of
 * select/check more than one users to be assigned on certain program").
 * Users already actively assigned are skipped rather than erroring out the
 * whole batch.
 */
export async function bulkCreateProgramAssignments(req: Request, res: Response): Promise<void> {
  const data = bulkProgramAssignmentSchema.parse(req.body);
  const tenantId = requireTenantId(req);

  const program = await prisma.program.findFirst({ where: { id: data.programId, tenantId } });
  if (!program) throw new ApiError(400, "programId does not belong to your tenant");

  const users = await prisma.user.findMany({
    where: { id: { in: data.userIds }, tenantId },
    select: { id: true, name: true, email: true },
  });
  if (users.length !== data.userIds.length) {
    throw new ApiError(400, "One or more userIds do not belong to your tenant");
  }

  const existingActive = await prisma.programAssignment.findMany({
    where: { programId: data.programId, userId: { in: data.userIds }, status: "ACTIVE" },
    select: { userId: true },
  });
  const alreadyAssigned = new Set(existingActive.map((a) => a.userId));
  const toAssign = users.filter((u) => !alreadyAssigned.has(u.id));

  const created = await prisma.$transaction(
    toAssign.map((u) =>
      prisma.programAssignment.create({
        data: { userId: u.id, programId: data.programId, tenantId },
        include: assignmentInclude,
      })
    )
  );

  await recordActivity({
    tenantId,
    userId: req.user!.sub,
    action: "bulk assigned",
    entityType: "ProgramAssignment",
    entityId: program.id,
    metadata: { program: program.name, assignedCount: created.length, skippedCount: alreadyAssigned.size },
  });

  await Promise.all(
    created.map((assignment) =>
      notifyUser({
        tenantId,
        userId: assignment.userId,
        type: "ASSIGNMENT_PROGRAM",
        message: `You've been assigned to the program "${program.name}"`,
        entityType: "Program",
        entityId: program.id,
      })
    )
  );

  sendResponse(res, 201, `Assigned ${created.length} of ${data.userIds.length} selected user(s)`, {
    created,
    skippedCount: alreadyAssigned.size,
  });
}

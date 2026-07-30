import type { Request, Response } from "express";
import { requireTenantId } from "../middleware/auth.js";
import { ApiError } from "../middleware/errorHandler.js";
import { sendResponse } from "../utils/apiResponse.js";
import { prisma } from "../utils/prisma.js";
import { createProgramSchema, updateProgramSchema } from "../utils/validators.js";
import { recordActivity } from "../utils/activityLog.js";

function idParam(req: Request): string {
  return req.params.id as string;
}

export async function listPrograms(req: Request, res: Response): Promise<void> {
  const programs = await prisma.program.findMany({
    where: { tenantId: requireTenantId(req) },
    orderBy: { createdAt: "desc" },
  });
  sendResponse(res, 200, "Programs retrieved successfully", programs);
}

export async function getProgram(req: Request, res: Response): Promise<void> {
  const program = await prisma.program.findFirst({
    where: { id: idParam(req), tenantId: requireTenantId(req) },
  });
  if (!program) throw new ApiError(404, "Program not found");
  sendResponse(res, 200, "Program retrieved successfully", program);
}

export async function createProgram(req: Request, res: Response): Promise<void> {
  const data = createProgramSchema.parse(req.body);
  const tenantId = requireTenantId(req);
  const program = await prisma.program.create({ data: { ...data, tenantId } });

  await recordActivity({
    tenantId,
    userId: req.user!.sub,
    action: "created",
    entityType: "Program",
    entityId: program.id,
    metadata: { name: program.name },
  });

  sendResponse(res, 201, "Program created successfully", program);
}

export async function updateProgram(req: Request, res: Response): Promise<void> {
  const data = updateProgramSchema.parse(req.body);
  const tenantId = requireTenantId(req);

  const existing = await prisma.program.findFirst({
    where: { id: idParam(req), tenantId },
  });
  if (!existing) throw new ApiError(404, "Program not found");

  const program = await prisma.program.update({ where: { id: existing.id }, data });

  await recordActivity({
    tenantId,
    userId: req.user!.sub,
    action: "updated",
    entityType: "Program",
    entityId: program.id,
  });

  sendResponse(res, 200, "Program updated successfully", program);
}

export async function deleteProgram(req: Request, res: Response): Promise<void> {
  const tenantId = requireTenantId(req);
  const existing = await prisma.program.findFirst({
    where: { id: idParam(req), tenantId },
  });
  if (!existing) throw new ApiError(404, "Program not found");

  await prisma.program.delete({ where: { id: existing.id } });

  await recordActivity({
    tenantId,
    userId: req.user!.sub,
    action: "deleted",
    entityType: "Program",
    entityId: existing.id,
    metadata: { name: existing.name },
  });

  sendResponse(res, 200, "Program deleted successfully", null);
}

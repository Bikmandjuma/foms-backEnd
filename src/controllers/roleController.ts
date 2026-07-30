import type { Request, Response } from "express";
import { requireTenantId } from "../middleware/auth.js";
import { ApiError } from "../middleware/errorHandler.js";
import { sendResponse } from "../utils/apiResponse.js";
import { prisma } from "../utils/prisma.js";
import { createRoleSchema, updateRoleSchema } from "../utils/validators.js";
import { recordActivity } from "../utils/activityLog.js";

function idParam(req: Request): string {
  return req.params.id as string;
}

export async function listRoles(req: Request, res: Response): Promise<void> {
  const roles = await prisma.role.findMany({
    where: { tenantId: requireTenantId(req) },
    orderBy: { createdAt: "desc" },
  });
  sendResponse(res, 200, "Roles retrieved successfully", roles);
}

export async function getRole(req: Request, res: Response): Promise<void> {
  const role = await prisma.role.findFirst({
    where: { id: idParam(req), tenantId: requireTenantId(req) },
  });
  if (!role) throw new ApiError(404, "Role not found");
  sendResponse(res, 200, "Role retrieved successfully", role);
}

export async function createRole(req: Request, res: Response): Promise<void> {
  const data = createRoleSchema.parse(req.body);
  const tenantId = requireTenantId(req);
  const role = await prisma.role.create({
    data: { ...data, permissions: data.permissions ?? [], tenantId },
  });

  await recordActivity({
    tenantId,
    userId: req.user!.sub,
    action: "created",
    entityType: "Role",
    entityId: role.id,
    metadata: { name: role.name },
  });

  sendResponse(res, 201, "Role created successfully", role);
}

export async function updateRole(req: Request, res: Response): Promise<void> {
  const data = updateRoleSchema.parse(req.body);
  const tenantId = requireTenantId(req);

  const existing = await prisma.role.findFirst({
    where: { id: idParam(req), tenantId },
  });
  if (!existing) throw new ApiError(404, "Role not found");

  const role = await prisma.role.update({ where: { id: existing.id }, data });

  await recordActivity({
    tenantId,
    userId: req.user!.sub,
    action: "updated",
    entityType: "Role",
    entityId: role.id,
    metadata: { permissions: data.permissions },
  });

  sendResponse(res, 200, "Role updated successfully", role);
}

export async function deleteRole(req: Request, res: Response): Promise<void> {
  const tenantId = requireTenantId(req);
  const existing = await prisma.role.findFirst({
    where: { id: idParam(req), tenantId },
  });
  if (!existing) throw new ApiError(404, "Role not found");

  await prisma.role.delete({ where: { id: existing.id } });

  await recordActivity({
    tenantId,
    userId: req.user!.sub,
    action: "deleted",
    entityType: "Role",
    entityId: existing.id,
    metadata: { name: existing.name },
  });

  sendResponse(res, 200, "Role deleted successfully", null);
}

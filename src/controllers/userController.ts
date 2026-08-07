import bcrypt from "bcryptjs";
import type { Request, Response } from "express";
import { requireTenantId } from "../middleware/auth.js";
import { ApiError } from "../middleware/errorHandler.js";
import { sendResponse } from "../utils/apiResponse.js";
import { prisma } from "../utils/prisma.js";
import { createUserSchema, updateUserSchema } from "../utils/validators.js";
import { recordActivity } from "../utils/activityLog.js";
import { hasAction, parsePermissions } from "../utils/permissions.js";

const SALT_ROUNDS = 10;

const userSelect = {
  id: true,
  email: true,
  name: true,
  firstName: true,
  lastName: true,
  avatarUrl: true,
  telephone: true,
  province: true,
  district: true,
  sector: true,
  cell: true,
  village: true,
  gender: true,
  dateOfBirth: true,
  status: true,
  educationLevel: true,
  createdAt: true,
  updatedAt: true,
  lastSeenAt: true,
  roleId: true,
  role: { select: { id: true, name: true } },
  tenantId: true,
} as const;

// `name` is kept in sync from firstName+lastName wherever those are the
// fields actually being edited (the new User form), so anywhere in the app
// still displaying the old single `.name` field keeps working unchanged.
function deriveName(data: { name?: string; firstName?: string; lastName?: string }): { name?: string } {
  if (data.firstName !== undefined || data.lastName !== undefined) {
    const combined = [data.firstName, data.lastName].filter(Boolean).join(" ").trim();
    if (combined) return { name: combined };
  }
  return {};
}

function idParam(req: Request): string {
  return req.params.id as string;
}

async function assertRoleInTenant(roleId: string, tenantId: string): Promise<void> {
  const role = await prisma.role.findFirst({ where: { id: roleId, tenantId } });
  if (!role) throw new ApiError(400, "roleId does not belong to your tenant");
}

// Editing your OWN record is allowed without users:manage (see
// requirePermissionOrSelf), but that self-service door must not double as a
// way to hand yourself a new role or flip your own status — only an actual
// manager may change those two fields, on anyone, including themselves.
async function actorHasManagePermission(req: Request): Promise<boolean> {
  if (req.user!.isPlatformAdmin) return true;
  if (!req.user!.roleId) return false;
  const role = await prisma.role.findUnique({ where: { id: req.user!.roleId }, select: { permissions: true } });
  return hasAction(parsePermissions(role?.permissions), "users:edit");
}

export async function listUsers(req: Request, res: Response): Promise<void> {
  const users = await prisma.user.findMany({
    where: { tenantId: requireTenantId(req) },
    select: userSelect,
    orderBy: { createdAt: "desc" },
  });
  sendResponse(res, 200, "Users retrieved successfully", users);
}

export async function getUser(req: Request, res: Response): Promise<void> {
  const user = await prisma.user.findFirst({
    where: { id: idParam(req), tenantId: requireTenantId(req) },
    select: userSelect,
  });

  if (!user) throw new ApiError(404, "User not found");
  sendResponse(res, 200, "User retrieved successfully", user);
}

export async function createUser(req: Request, res: Response): Promise<void> {
  const data = createUserSchema.parse(req.body);
  const tenantId = requireTenantId(req);

  await assertRoleInTenant(data.roleId, tenantId);

  const password = await bcrypt.hash(data.password, SALT_ROUNDS);

  const user = await prisma.user.create({
    data: { ...data, ...deriveName(data), password, tenantId },
    select: userSelect,
  });

  await recordActivity({
    tenantId,
    userId: req.user!.sub,
    action: "created",
    entityType: "User",
    entityId: user.id,
    metadata: { email: user.email },
  });

  sendResponse(res, 201, "User created successfully", user);
}

export async function updateUser(req: Request, res: Response): Promise<void> {
  const data = updateUserSchema.parse(req.body);
  const tenantId = requireTenantId(req);

  const existing = await prisma.user.findFirst({ where: { id: idParam(req), tenantId } });
  if (!existing) throw new ApiError(404, "User not found");

  if ((data.roleId !== undefined || data.status !== undefined) && !(await actorHasManagePermission(req))) {
    throw new ApiError(403, "Only a manager can change role or status");
  }

  if (data.roleId) await assertRoleInTenant(data.roleId, tenantId);

  const { password, ...rest } = data;

  const user = await prisma.user.update({
    where: { id: existing.id },
    data: {
      ...rest,
      ...deriveName(rest),
      ...(password ? { password: await bcrypt.hash(password, SALT_ROUNDS) } : {}),
    },
    select: userSelect,
  });

  await recordActivity({
    tenantId,
    userId: req.user!.sub,
    action: "updated",
    entityType: "User",
    entityId: user.id,
  });

  sendResponse(res, 200, "User updated successfully", user);
}

export async function deleteUser(req: Request, res: Response): Promise<void> {
  const tenantId = requireTenantId(req);
  const existing = await prisma.user.findFirst({
    where: { id: idParam(req), tenantId },
  });
  if (!existing) throw new ApiError(404, "User not found");

  await prisma.user.delete({ where: { id: existing.id } });

  await recordActivity({
    tenantId,
    userId: req.user!.sub,
    action: "deleted",
    entityType: "User",
    entityId: existing.id,
    metadata: { email: existing.email },
  });

  sendResponse(res, 200, "User deleted successfully", null);
}

// Self-service avatar upload — separate from the JSON PATCH endpoint since
// this one carries a multipart file. Always affects the caller's own
// account; there's no "set someone else's avatar" version of this.
export async function uploadMyAvatar(req: Request, res: Response): Promise<void> {
  const file = (req as Request & { file?: Express.Multer.File }).file;
  if (!file) throw new ApiError(400, "No image file was uploaded");

  const avatarUrl = `/uploads/avatars/${file.filename}`;

  const user = await prisma.user.update({
    where: { id: req.user!.sub },
    data: { avatarUrl },
    select: userSelect,
  });

  await recordActivity({
    tenantId: user.tenantId,
    userId: req.user!.sub,
    action: "updated profile photo",
    entityType: "User",
    entityId: user.id,
  });

  sendResponse(res, 200, "Profile photo updated successfully", user);
}

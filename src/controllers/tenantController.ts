import bcrypt from "bcryptjs";
import type { Request, Response } from "express";
import { ApiError } from "../middleware/errorHandler.js";
import { sendResponse } from "../utils/apiResponse.js";
import { prisma } from "../utils/prisma.js";
import { createTenantSchema, updateTenantSchema } from "../utils/validators.js";
import { ALL_TENANT_PERMISSIONS } from "../utils/permissions.js";
import { withFullName } from "../utils/fullName.js";
import { getOnlineUserIds } from "../realtime/socket.js";

const SALT_ROUNDS = 10;
const ADMIN_ROLE_NAME = "admin";

function idParam(req: Request): string {
  return req.params.id as string;
}

const tenantSelect = {
  id: true,
  name: true,
  createdAt: true,
  updatedAt: true,
} as const;

export async function listTenants(_req: Request, res: Response): Promise<void> {
  const tenants = await prisma.tenant.findMany({ select: tenantSelect, orderBy: { createdAt: "desc" } });
  sendResponse(res, 200, "Tenants retrieved successfully", tenants);
}

export async function getTenant(req: Request, res: Response): Promise<void> {
  const tenant = await prisma.tenant.findUnique({ where: { id: idParam(req) }, select: tenantSelect });
  if (!tenant) throw new ApiError(404, "Tenant not found");
  sendResponse(res, 200, "Tenant retrieved successfully", tenant);
}

export async function createTenant(req: Request, res: Response): Promise<void> {
  const { name, admin } = createTenantSchema.parse(req.body);
  const password = await bcrypt.hash(admin.password, SALT_ROUNDS);

  const tenant = await prisma.$transaction(async (tx) => {
    const createdTenant = await tx.tenant.create({ data: { name } });

    const adminRole = await tx.role.create({
      data: {
        name: ADMIN_ROLE_NAME,
        description: "Tenant administrator",
        tenantId: createdTenant.id,
        permissions: ALL_TENANT_PERMISSIONS,
      },
    });

    await tx.user.create({
      data: {
        ...admin,
        password,
        tenantId: createdTenant.id,
        roleId: adminRole.id,
      },
    });

    return createdTenant;
  });

  sendResponse(res, 201, "Tenant created successfully", tenant);
}

export async function updateTenant(req: Request, res: Response): Promise<void> {
  const data = updateTenantSchema.parse(req.body);
  const tenant = await prisma.tenant.update({
    where: { id: idParam(req) },
    data,
    select: tenantSelect,
  });
  sendResponse(res, 200, "Tenant updated successfully", tenant);
}

export async function deleteTenant(req: Request, res: Response): Promise<void> {
  await prisma.tenant.delete({ where: { id: idParam(req) } });
  sendResponse(res, 200, "Tenant deleted successfully", null);
}

// Platform-admin only: every user across every tenant who holds the
// tenant's "admin" role — i.e. the person(s) who actually run each
// workspace, for the sidebar's "Tenant administrators" list.
export async function listTenantAdmins(_req: Request, res: Response): Promise<void> {
  const admins = await prisma.user.findMany({
    where: { role: { name: { equals: ADMIN_ROLE_NAME } } },
    select: {
      id: true,
      name: true,
      firstName: true,
      lastName: true,
      email: true,
      avatarUrl: true,
      lastSeenAt: true,
      status: true,
      tenant: { select: { id: true, name: true, createdAt: true } },
    },
    orderBy: { tenant: { name: "asc" } },
  });

  sendResponse(res, 200, "Tenant administrators retrieved successfully", admins.map(withFullName));
}

// Platform-admin only, read-only: a full picture of one tenant — counts,
// who's online right now, and the actual lists (users/roles/programs/
// respondents/recent activity) — nothing here can add, edit, or delete
// anything, it's strictly "look but don't touch" per the spec.
export async function getTenantOverview(req: Request, res: Response): Promise<void> {
  const tenantId = idParam(req);
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: tenantSelect });
  if (!tenant) throw new ApiError(404, "Tenant not found");

  const [users, roles, programs, beneficiaries, activityLogs] = await Promise.all([
    prisma.user.findMany({
      where: { tenantId },
      select: {
        id: true,
        name: true,
        firstName: true,
        lastName: true,
        email: true,
        status: true,
        lastSeenAt: true,
        role: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.role.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" } }),
    prisma.program.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" } }),
    prisma.beneficiary.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" }, take: 500 }),
    prisma.activityLog.findMany({
      where: { tenantId },
      include: { user: { select: { id: true, name: true, firstName: true, lastName: true, email: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);

  const onlineUserIds = getOnlineUserIds(tenantId);

  sendResponse(res, 200, "Tenant overview retrieved successfully", {
    tenant,
    counts: {
      users: users.length,
      roles: roles.length,
      programs: programs.length,
      beneficiaries: beneficiaries.length,
      online: onlineUserIds.length,
    },
    users: users.map(withFullName),
    roles,
    programs,
    beneficiaries,
    activityLogs: activityLogs.map((l) => ({ ...l, user: l.user ? withFullName(l.user) : null })),
  });
}

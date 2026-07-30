import bcrypt from "bcryptjs";
import type { Request, Response } from "express";
import { ApiError } from "../middleware/errorHandler.js";
import { sendResponse } from "../utils/apiResponse.js";
import { prisma } from "../utils/prisma.js";
import { createTenantSchema, updateTenantSchema } from "../utils/validators.js";
import { ALL_TENANT_PERMISSIONS } from "../utils/permissions.js";

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

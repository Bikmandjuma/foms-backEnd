import type { NextFunction, Request, Response } from "express";
import { ApiError } from "./errorHandler.js";
import { prisma } from "../utils/prisma.js";
import { parsePermissions, type Permission } from "../utils/permissions.js";

/**
 * Gate a route on a specific permission. Platform admins always pass.
 * Otherwise the user's role is fetched fresh (roles can change permissions
 * at any time — we don't trust anything baked into the JWT for this) and
 * checked against its `permissions` JSON array.
 */
export function requirePermission(action: Permission) {
  return async function (req: Request, _res: Response, next: NextFunction): Promise<void> {
    if (req.user?.isPlatformAdmin) {
      next();
      return;
    }

    const roleId = req.user?.roleId;
    if (!roleId) throw new ApiError(403, "Your account has no role assigned");

    const role = await prisma.role.findUnique({ where: { id: roleId }, select: { permissions: true } });
    const permissions = parsePermissions(role?.permissions);

    if (!permissions.includes(action)) {
      throw new ApiError(403, `You don't have permission to perform this action (${action})`);
    }
    next();
  };
}

import type { NextFunction, Request, Response } from "express";
import { ApiError } from "./errorHandler.js";
import { prisma } from "../utils/prisma.js";
import { hasAction, parsePermissions, type Permission } from "../utils/permissions.js";

/**
 * Gate a route on a specific permission. Platform admins always pass.
 * Otherwise the user's role is fetched fresh (roles can change permissions
 * at any time — we don't trust anything baked into the JWT for this) and
 * checked against its `permissions` JSON array. A legacy "resource:manage"
 * grant still satisfies any granular view/create/edit/delete check on that
 * resource (see hasAction) so roles saved before the granular permission
 * model keep working until they're next edited and re-saved.
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

    if (!hasAction(permissions, action)) {
      throw new ApiError(403, `You don't have permission to perform this action (${action})`);
    }
    next();
  };
}

/**
 * Same as requirePermission, but also lets a request through if the URL
 * param (default `:id`) refers to the requester's own record — every user
 * can always view/edit their own profile, even without users:view /
 * users:edit. Used only for the user resource itself; deleting someone
 * (including yourself) still goes through requirePermission("users:delete").
 */
export function requirePermissionOrSelf(action: Permission, paramName = "id") {
  return async function (req: Request, _res: Response, next: NextFunction): Promise<void> {
    if (req.user?.isPlatformAdmin || req.params[paramName] === req.user?.sub) {
      next();
      return;
    }

    const roleId = req.user?.roleId;
    if (!roleId) throw new ApiError(403, "Your account has no role assigned");

    const role = await prisma.role.findUnique({ where: { id: roleId }, select: { permissions: true } });
    const permissions = parsePermissions(role?.permissions);

    if (!hasAction(permissions, action)) {
      throw new ApiError(403, `You don't have permission to perform this action (${action})`);
    }
    next();
  };
}

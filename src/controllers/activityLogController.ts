import type { Request, Response } from "express";
import { requireTenantId } from "../middleware/auth.js";
import { sendResponse } from "../utils/apiResponse.js";
import { prisma } from "../utils/prisma.js";
import { hasAction, parsePermissions } from "../utils/permissions.js";

async function canViewEveryonesActivity(req: Request): Promise<boolean> {
  if (req.user?.isPlatformAdmin) return true;
  if (!req.user?.roleId) return false;
  const role = await prisma.role.findUnique({ where: { id: req.user.roleId }, select: { permissions: true } });
  return hasAction(parsePermissions(role?.permissions), "activity:view");
}

/**
 * Anyone authenticated can see their OWN activity — that's just their own
 * account history, no special permission needed. Seeing what everyone ELSE
 * in the tenant did requires activity:view. Without it, a userId filter the
 * caller sends is ignored and silently forced back to their own id — this
 * is "self-management", not an error, per the field-ops requirement that a
 * regular user must never see what an admin or other user did.
 */
export async function listActivityLogs(req: Request, res: Response): Promise<void> {
  const { userId, entityType, limit } = req.query;
  const take = Math.min(Number(limit) || 100, 200);

  const canViewAll = await canViewEveryonesActivity(req);
  const tenantId = req.user?.isPlatformAdmin ? undefined : requireTenantId(req);
  const scopedUserId = canViewAll ? (typeof userId === "string" ? userId : undefined) : req.user!.sub;

  const logs = await prisma.activityLog.findMany({
    where: {
      ...(tenantId ? { tenantId } : {}),
      ...(scopedUserId ? { userId: scopedUserId } : {}),
      ...(typeof entityType === "string" ? { entityType } : {}),
    },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: "desc" },
    take,
  });

  sendResponse(res, 200, "Activity logs retrieved successfully", logs);
}

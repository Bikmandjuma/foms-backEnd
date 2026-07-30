import type { Request, Response } from "express";
import { requireTenantId } from "../middleware/auth.js";
import { sendResponse } from "../utils/apiResponse.js";
import { prisma } from "../utils/prisma.js";

export async function listActivityLogs(req: Request, res: Response): Promise<void> {
  const { userId, entityType, limit } = req.query;
  const take = Math.min(Number(limit) || 100, 200);

  // Platform admins see everything; tenant users see only their own tenant.
  const tenantId = req.user?.isPlatformAdmin ? undefined : requireTenantId(req);

  const logs = await prisma.activityLog.findMany({
    where: {
      ...(tenantId ? { tenantId } : {}),
      ...(typeof userId === "string" ? { userId } : {}),
      ...(typeof entityType === "string" ? { entityType } : {}),
    },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: "desc" },
    take,
  });

  sendResponse(res, 200, "Activity logs retrieved successfully", logs);
}

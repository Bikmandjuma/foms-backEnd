import type { Request, Response } from "express";
import { z } from "zod";
import { requireTenantId } from "../middleware/auth.js";
import { ApiError } from "../middleware/errorHandler.js";
import { sendResponse } from "../utils/apiResponse.js";
import { prisma } from "../utils/prisma.js";
import { recordActivity } from "../utils/activityLog.js";

const include = {
  user: { select: { id: true, name: true, email: true } },
  project: { select: { id: true, name: true } },
} as const;

const checkInSchema = z.object({
  projectId: z.string().uuid().optional(),
  gpsLat: z.number().optional(),
  gpsLng: z.number().optional(),
  note: z.string().optional(),
});

function idParam(req: Request): string {
  return req.params.id as string;
}

export async function listCheckIns(req: Request, res: Response): Promise<void> {
  const tenantId = requireTenantId(req);
  const { userId, projectId, active } = req.query;

  const checkIns = await prisma.fieldCheckIn.findMany({
    where: {
      tenantId,
      ...(typeof userId === "string" ? { userId } : {}),
      ...(typeof projectId === "string" ? { projectId } : {}),
      ...(active === "true" ? { checkOutAt: null } : {}),
    },
    include,
    orderBy: { checkInAt: "desc" },
  });
  sendResponse(res, 200, "Field check-ins retrieved successfully", checkIns);
}

export async function createCheckIn(req: Request, res: Response): Promise<void> {
  const data = checkInSchema.parse(req.body);
  const tenantId = requireTenantId(req);

  if (data.projectId) {
    const project = await prisma.program.findFirst({ where: { id: data.projectId, tenantId } });
    if (!project) throw new ApiError(400, "projectId does not belong to your tenant");
  }

  const checkIn = await prisma.fieldCheckIn.create({
    data: { ...data, tenantId, userId: req.user!.sub },
    include,
  });

  await recordActivity({
    tenantId,
    userId: req.user!.sub,
    action: "checked in",
    entityType: "FieldCheckIn",
    entityId: checkIn.id,
  });

  sendResponse(res, 201, "Checked in successfully", checkIn);
}

export async function endCheckIn(req: Request, res: Response): Promise<void> {
  const tenantId = requireTenantId(req);
  const existing = await prisma.fieldCheckIn.findFirst({ where: { id: idParam(req), tenantId } });
  if (!existing) throw new ApiError(404, "Check-in not found");
  if (existing.userId !== req.user!.sub && !req.user!.isPlatformAdmin) {
    throw new ApiError(403, "You can only check yourself out");
  }

  const checkIn = await prisma.fieldCheckIn.update({
    where: { id: existing.id },
    data: { checkOutAt: new Date() },
    include,
  });

  await recordActivity({
    tenantId,
    userId: req.user!.sub,
    action: "checked out",
    entityType: "FieldCheckIn",
    entityId: checkIn.id,
  });

  sendResponse(res, 200, "Checked out successfully", checkIn);
}

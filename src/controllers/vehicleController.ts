import type { Request, Response } from "express";
import { requireTenantId } from "../middleware/auth.js";
import { ApiError } from "../middleware/errorHandler.js";
import { sendResponse } from "../utils/apiResponse.js";
import { prisma } from "../utils/prisma.js";
import { createVehicleSchema, updateVehicleSchema } from "../utils/validators.js";
import { recordActivity } from "../utils/activityLog.js";

function idParam(req: Request): string {
  return req.params.id as string;
}

export async function listVehicles(req: Request, res: Response): Promise<void> {
  const { active } = req.query;
  const vehicles = await prisma.vehicle.findMany({
    where: {
      tenantId: requireTenantId(req),
      ...(active === "true" ? { active: true } : active === "false" ? { active: false } : {}),
    },
    orderBy: { createdAt: "desc" },
  });
  sendResponse(res, 200, "Vehicles retrieved successfully", vehicles);
}

export async function getVehicle(req: Request, res: Response): Promise<void> {
  const vehicle = await prisma.vehicle.findFirst({ where: { id: idParam(req), tenantId: requireTenantId(req) } });
  if (!vehicle) throw new ApiError(404, "Vehicle not found");
  sendResponse(res, 200, "Vehicle retrieved successfully", vehicle);
}

export async function createVehicle(req: Request, res: Response): Promise<void> {
  const data = createVehicleSchema.parse(req.body);
  const tenantId = requireTenantId(req);
  const vehicle = await prisma.vehicle.create({ data: { ...data, tenantId } });

  await recordActivity({
    tenantId,
    userId: req.user!.sub,
    action: "created",
    entityType: "Vehicle",
    entityId: vehicle.id,
    metadata: { name: vehicle.name, type: vehicle.type, driverName: vehicle.driverName },
  });

  sendResponse(res, 201, "Vehicle created successfully", vehicle);
}

export async function updateVehicle(req: Request, res: Response): Promise<void> {
  const data = updateVehicleSchema.parse(req.body);
  const tenantId = requireTenantId(req);
  const existing = await prisma.vehicle.findFirst({ where: { id: idParam(req), tenantId } });
  if (!existing) throw new ApiError(404, "Vehicle not found");

  const vehicle = await prisma.vehicle.update({ where: { id: existing.id }, data });

  await recordActivity({
    tenantId,
    userId: req.user!.sub,
    action: "updated",
    entityType: "Vehicle",
    entityId: vehicle.id,
    metadata: { name: vehicle.name },
  });

  sendResponse(res, 200, "Vehicle updated successfully", vehicle);
}

export async function deleteVehicle(req: Request, res: Response): Promise<void> {
  const tenantId = requireTenantId(req);
  const existing = await prisma.vehicle.findFirst({ where: { id: idParam(req), tenantId } });
  if (!existing) throw new ApiError(404, "Vehicle not found");

  await prisma.vehicle.delete({ where: { id: existing.id } });

  await recordActivity({
    tenantId,
    userId: req.user!.sub,
    action: "deleted",
    entityType: "Vehicle",
    entityId: existing.id,
    metadata: { name: existing.name },
  });

  sendResponse(res, 200, "Vehicle deleted successfully", null);
}

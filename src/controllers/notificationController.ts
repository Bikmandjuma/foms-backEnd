import type { Request, Response } from "express";
import { ApiError } from "../middleware/errorHandler.js";
import { sendResponse } from "../utils/apiResponse.js";
import { prisma } from "../utils/prisma.js";

function idParam(req: Request): string {
  return req.params.id as string;
}

export async function listNotifications(req: Request, res: Response): Promise<void> {
  const notifications = await prisma.notification.findMany({
    where: { userId: req.user!.sub },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  const unreadCount = await prisma.notification.count({ where: { userId: req.user!.sub, read: false } });
  sendResponse(res, 200, "Notifications retrieved successfully", { notifications, unreadCount });
}

export async function markNotificationRead(req: Request, res: Response): Promise<void> {
  const existing = await prisma.notification.findFirst({ where: { id: idParam(req), userId: req.user!.sub } });
  if (!existing) throw new ApiError(404, "Notification not found");

  const notification = await prisma.notification.update({
    where: { id: existing.id },
    data: { read: true },
  });
  sendResponse(res, 200, "Notification marked as read", notification);
}

export async function markAllNotificationsRead(req: Request, res: Response): Promise<void> {
  await prisma.notification.updateMany({
    where: { userId: req.user!.sub, read: false },
    data: { read: true },
  });
  sendResponse(res, 200, "All notifications marked as read", null);
}

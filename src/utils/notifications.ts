import { prisma } from "./prisma.js";
import { emitNotification } from "../realtime/socket.js";
import type { NotificationType } from "../generated/prisma/enums.js";

interface CreateNotificationInput {
  tenantId: string | null;
  userId: string;
  type: NotificationType;
  message: string;
  entityType?: string;
  entityId?: string;
}

/**
 * Creates a notification row and pushes it live over Socket.io to that
 * user's room if they're connected. If they're offline, it just sits in the
 * DB and shows up next time they open the bell menu / list endpoint.
 */
export async function notifyUser(input: CreateNotificationInput): Promise<void> {
  try {
    const notification = await prisma.notification.create({
      data: {
        tenantId: input.tenantId,
        userId: input.userId,
        type: input.type,
        message: input.message,
        entityType: input.entityType,
        entityId: input.entityId,
      },
    });
    emitNotification(input.userId, notification);
  } catch (err) {
    console.error("Failed to create notification:", err);
  }
}

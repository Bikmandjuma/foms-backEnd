import { prisma } from "./prisma.js";
import { emitActivity } from "../realtime/socket.js";
import type { Prisma } from "../generated/prisma/client.js";

interface RecordActivityInput {
  tenantId: string | null;
  userId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Fire-and-forget audit trail entry. Never throws into the caller's request
 * flow — a logging failure should never block the actual operation.
 */
export async function recordActivity(input: RecordActivityInput): Promise<void> {
  try {
    const entry = await prisma.activityLog.create({
      data: {
        tenantId: input.tenantId,
        userId: input.userId,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        metadata: (input.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
    emitActivity(input.tenantId, entry);
  } catch (err) {
    console.error("Failed to record activity log:", err);
  }
}

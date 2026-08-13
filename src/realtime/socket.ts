import type { Server as HTTPServer } from "http";
import { Server as IOServer } from "socket.io";
import { verifyToken } from "../utils/jwt.js";
import { prisma } from "../utils/prisma.js";

let io: IOServer | null = null;

interface ConnectionInfo {
  userId: string;
  tenantId: string | null;
  isPlatformAdmin: boolean;
}

// socketId -> who that socket belongs to, so disconnect can look itself up
// without needing the closure captured at connect-time.
const socketInfo = new Map<string, ConnectionInfo>();

// userId -> set of live socket ids. A user can have several tabs/devices
// open at once; they only go "offline" once every socket disconnects.
const onlineSockets = new Map<string, Set<string>>();

export function initSocket(httpServer: HTTPServer): IOServer {
  io = new IOServer(httpServer, {
    cors: { origin: true, credentials: true },
  });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token as string | undefined;
      if (!token) {
        next(new Error("Authentication required"));
        return;
      }
      const payload = verifyToken(token);
      const user = await prisma.user.findUnique({
        where: { id: payload.sub },
        select: { tokenVersion: true },
      });
      if (!user || user.tokenVersion !== payload.tokenVersion) {
        next(new Error("Session expired"));
        return;
      }
      socket.data.userId = payload.sub;
      socket.data.tenantId = payload.tenantId ?? null;
      socket.data.isPlatformAdmin = payload.isPlatformAdmin ?? false;
      next();
    } catch {
      next(new Error("Invalid token"));
    }
  });

  io.on("connection", (socket) => {
    const info: ConnectionInfo = {
      userId: socket.data.userId as string,
      tenantId: socket.data.tenantId as string | null,
      isPlatformAdmin: !!socket.data.isPlatformAdmin,
    };
    socketInfo.set(socket.id, info);

    if (info.tenantId) socket.join(`tenant:${info.tenantId}`);
    if (info.isPlatformAdmin) socket.join("platform-admins");
    socket.join(`user:${info.userId}`);

    if (!onlineSockets.has(info.userId)) onlineSockets.set(info.userId, new Set());
    onlineSockets.get(info.userId)!.add(socket.id);

    broadcastPresence(info.tenantId);

    socket.on("disconnect", () => {
      socketInfo.delete(socket.id);
      const set = onlineSockets.get(info.userId);
      set?.delete(socket.id);
      if (set && set.size === 0) onlineSockets.delete(info.userId);
      broadcastPresence(info.tenantId);
    });
  });

  return io;
}

// The user ids of every currently-connected socket that belongs to the
// given tenant. Platform admins pass tenantId = null to mean "everyone,
// everywhere" instead of one tenant's slice.
export function getOnlineUserIds(tenantId?: string | null): string[] {
  const ids = new Set<string>();
  for (const info of socketInfo.values()) {
    if (tenantId === undefined || info.tenantId === tenantId) ids.add(info.userId);
  }
  return Array.from(ids);
}

function broadcastPresence(tenantId: string | null): void {
  if (!io) return;

  if (tenantId) {
    const onlineUserIds = getOnlineUserIds(tenantId);
    io.to(`tenant:${tenantId}`).emit("presence:update", { onlineUserIds, count: onlineUserIds.length });
  }

  // Platform admins watch the whole system, not one tenant's room.
  const globalIds = getOnlineUserIds(undefined);
  io.to("platform-admins").emit("presence:update", { onlineUserIds: globalIds, count: globalIds.length });
}

export function emitActivity(tenantId: string | null, entry: unknown): void {
  if (!io || !tenantId) return;
  io.to(`tenant:${tenantId}`).emit("activity:new", entry);
}

export function emitNotification(userId: string, notification: unknown): void {
  if (!io) return;
  io.to(`user:${userId}`).emit("notification:new", notification);
}

/** Broadcast to a tenant's room whenever a field worker's live location
 * changes, so the field-ops map can move a pin instantly instead of
 * waiting on the next poll. */
export function emitLocationUpdate(
  tenantId: string | null,
  payload: { userId: string; checkInId: string; lat: number; lng: number; at: string }
): void {
  if (!io || !tenantId) return;
  io.to(`tenant:${tenantId}`).emit("location:update", payload);
}

/** Broadcast to a tenant's room when a Supervisor or Enumerator (identified
 * by having a groupCode — set only for users created via the group import,
 * since role names are freeform per tenant and can't be matched reliably)
 * logs in. Anyone else viewing the dashboard sees a toast naming their
 * group and who just came online. */
export function emitUserOnline(
  tenantId: string | null,
  payload: { userId: string; name: string; groupCode: string | null; groupName: string | null; roleName: string | null }
): void {
  if (!io || !tenantId) return;
  io.to(`tenant:${tenantId}`).emit("user:online", payload);
}

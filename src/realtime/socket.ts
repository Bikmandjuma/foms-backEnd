import type { Server as HTTPServer } from "http";
import { Server as IOServer } from "socket.io";
import { verifyToken } from "../utils/jwt.js";
import { prisma } from "../utils/prisma.js";

let io: IOServer | null = null;

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
      next();
    } catch {
      next(new Error("Invalid token"));
    }
  });

  io.on("connection", (socket) => {
    const userId = socket.data.userId as string;
    const tenantId = socket.data.tenantId as string | null;

    if (tenantId) socket.join(`tenant:${tenantId}`);
    socket.join(`user:${userId}`);

    if (!onlineSockets.has(userId)) onlineSockets.set(userId, new Set());
    onlineSockets.get(userId)!.add(socket.id);
    broadcastPresence(tenantId);

    socket.on("disconnect", () => {
      const set = onlineSockets.get(userId);
      set?.delete(socket.id);
      if (set && set.size === 0) onlineSockets.delete(userId);
      broadcastPresence(tenantId);
    });
  });

  return io;
}

function broadcastPresence(tenantId: string | null): void {
  if (!io) return;
  const onlineUserIds = Array.from(onlineSockets.keys());
  const payload = { onlineUserIds, count: onlineUserIds.length };
  if (tenantId) io.to(`tenant:${tenantId}`).emit("presence:update", payload);
}

export function emitActivity(tenantId: string | null, entry: unknown): void {
  if (!io || !tenantId) return;
  io.to(`tenant:${tenantId}`).emit("activity:new", entry);
}

export function emitNotification(userId: string, notification: unknown): void {
  if (!io) return;
  io.to(`user:${userId}`).emit("notification:new", notification);
}

export function getOnlineUserIds(): string[] {
  return Array.from(onlineSockets.keys());
}

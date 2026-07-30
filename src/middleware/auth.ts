import type { NextFunction, Request, Response } from "express";
import { ApiError } from "./errorHandler.js";
import { prisma } from "../utils/prisma.js";
import { verifyToken } from "../utils/jwt.js";

const COOKIE_NAME = "token";

export async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const cookieToken = (req.cookies as Record<string, string> | undefined)?.[COOKIE_NAME];
  const header = req.headers.authorization;
  const bearerToken = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  const token = cookieToken ?? bearerToken;

  if (!token) throw new ApiError(401, "Authentication required");

  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    throw new ApiError(401, "Invalid or expired token");
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { tokenVersion: true, lastSeenAt: true },
  });

  if (!user || user.tokenVersion !== payload.tokenVersion) {
    throw new ApiError(401, "Session expired, please log in again");
  }

  req.user = payload;

  // Throttled presence heartbeat: only touch the DB if it's been a while,
  // so we're not writing on literally every request. Socket.io provides the
  // real-time signal; this is the fallback for REST-only activity.
  const staleAfterMs = 60_000;
  if (!user.lastSeenAt || Date.now() - user.lastSeenAt.getTime() > staleAfterMs) {
    prisma.user.update({ where: { id: payload.sub }, data: { lastSeenAt: new Date() } }).catch(() => {});
  }

  next();
}

export function requirePlatformAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user?.isPlatformAdmin) throw new ApiError(403, "Platform admin access required");
  next();
}

export function requireTenantId(req: Request): string {
  const tenantId = req.user?.tenantId;
  if (!tenantId) throw new ApiError(403, "This resource is not available to platform admins");
  return tenantId;
}

import bcrypt from "bcryptjs";
import type { Request, Response } from "express";
import { z } from "zod";
import { ApiError } from "../middleware/errorHandler.js";
import { sendResponse } from "../utils/apiResponse.js";
import { prisma } from "../utils/prisma.js";
import { signToken } from "../utils/jwt.js";
import { recordActivity } from "../utils/activityLog.js";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const COOKIE_NAME = "token";
const COOKIE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export async function login(req: Request, res: Response): Promise<void> {
  const { email, password } = loginSchema.parse(req.body);

  const user = await prisma.user.findUnique({
    where: { email },
    include: { role: { select: { id: true, name: true, permissions: true } } },
  });

  if (!user || !(await bcrypt.compare(password, user.password))) {
    throw new ApiError(401, "Invalid email or password");
  }

  // Inactive/suspended accounts are unauthorized outright — no token is
  // issued at all, regardless of a correct password.
  if (!user.isPlatformAdmin && user.status !== "ACTIVE") {
    const reason =
      user.status === "SUSPENDED"
        ? "Your account has been suspended. Contact your administrator for help."
        : "Your account is inactive. Contact your administrator to reactivate it.";
    throw new ApiError(403, reason);
  }

  const token = signToken({
    sub: user.id,
    roleId: user.roleId,
    tenantId: user.tenantId,
    isPlatformAdmin: user.isPlatformAdmin,
    tokenVersion: user.tokenVersion,
  });

  await prisma.user.update({ where: { id: user.id }, data: { lastSeenAt: new Date() } });

  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE_MS,
  });

  await recordActivity({
    tenantId: user.tenantId,
    userId: user.id,
    action: "logged in",
    entityType: "User",
    entityId: user.id,
  });

  sendResponse(res, 200, "Login successful", {
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      tenantId: user.tenantId,
      isPlatformAdmin: user.isPlatformAdmin,
    },
  });
}

export async function logout(req: Request, res: Response): Promise<void> {
  const user = await prisma.user.update({
    where: { id: req.user!.sub },
    data: { tokenVersion: { increment: 1 } },
  });

  await recordActivity({
    tenantId: user.tenantId,
    userId: user.id,
    action: "logged out",
    entityType: "User",
    entityId: user.id,
  });

  res.clearCookie(COOKIE_NAME);
  sendResponse(res, 200, "Logout successful", null);
}

export async function me(req: Request, res: Response): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.sub },
    select: {
      id: true,
      email: true,
      name: true,
      telephone: true,
      province: true,
      district: true,
      sector: true,
      gender: true,
      dateOfBirth: true,
      status: true,
      educationLevel: true,
      isPlatformAdmin: true,
      lastSeenAt: true,
      createdAt: true,
      role: { select: { id: true, name: true, permissions: true } },
      tenant: { select: { id: true, name: true } },
    },
  });

  if (!user) throw new ApiError(404, "User not found");
  sendResponse(res, 200, "Current user retrieved successfully", user);
}

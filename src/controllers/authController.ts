import bcrypt from "bcryptjs";
import type { Request, Response } from "express";
import { z } from "zod";
import { ApiError } from "../middleware/errorHandler.js";
import { sendResponse } from "../utils/apiResponse.js";
import { prisma } from "../utils/prisma.js";
import { signToken, signResetToken, verifyResetToken } from "../utils/jwt.js";
import { recordActivity } from "../utils/activityLog.js";
import { sendMail } from "../utils/mailer.js";

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
      firstName: user.firstName,
      lastName: user.lastName,
      avatarUrl: user.avatarUrl,
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
      firstName: true,
      lastName: true,
      avatarUrl: true,
      telephone: true,
      province: { select: { id: true, name: true } },
      district: { select: { id: true, name: true } },
      sector: { select: { id: true, name: true } },
      cell: { select: { id: true, name: true } },
      village: { select: { id: true, name: true } },
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

const forgotPasswordSchema = z.object({ email: z.string().email() });
const verifyResetCodeSchema = z.object({ email: z.string().email(), code: z.string().length(6) });
const resetPasswordSchema = z.object({ resetToken: z.string().min(1), newPassword: z.string().min(8) });

const RESET_CODE_TTL_MS = 15 * 60 * 1000;

function generateSixDigitCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Works identically for platform admins, tenant admins, and regular users
// — there's only one User table, so this one flow covers everyone.
export async function forgotPassword(req: Request, res: Response): Promise<void> {
  const { email } = forgotPasswordSchema.parse(req.body);

  const user = await prisma.user.findUnique({ where: { email } });

  // Always respond the same way whether or not the email exists, so this
  // endpoint can't be used to enumerate registered accounts.
  const genericMessage = "If that email is registered, a verification code has been sent to it.";

  if (!user) {
    sendResponse(res, 200, genericMessage, null);
    return;
  }

  const code = generateSixDigitCode();
  await prisma.passwordResetCode.create({
    data: { userId: user.id, code, expiresAt: new Date(Date.now() + RESET_CODE_TTL_MS) },
  });

  await sendMail({
    to: user.email,
    subject: "Your Field Operation MS password reset code",
    text: `Your password reset code is ${code}. It expires in 15 minutes. If you didn't request this, you can ignore this email.`,
    html: `<p>Your password reset code is:</p><p style="font-size:28px;font-weight:700;letter-spacing:4px">${code}</p><p>It expires in 15 minutes. If you didn't request this, you can ignore this email.</p>`,
  });

  sendResponse(res, 200, genericMessage, null);
}

export async function verifyResetCode(req: Request, res: Response): Promise<void> {
  const { email, code } = verifyResetCodeSchema.parse(req.body);

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new ApiError(400, "Invalid code");

  const resetCode = await prisma.passwordResetCode.findFirst({
    where: { userId: user.id, code, usedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });

  if (!resetCode) throw new ApiError(400, "That code is invalid or has expired. Request a new one.");

  const resetToken = signResetToken({ sub: user.id, codeId: resetCode.id });
  sendResponse(res, 200, "Code verified", { resetToken });
}

export async function resetPassword(req: Request, res: Response): Promise<void> {
  const { resetToken, newPassword } = resetPasswordSchema.parse(req.body);

  let payload;
  try {
    payload = verifyResetToken(resetToken);
  } catch {
    throw new ApiError(400, "This reset link has expired. Start the forgot-password process again.");
  }

  const resetCode = await prisma.passwordResetCode.findFirst({
    where: { id: payload.codeId, userId: payload.sub, usedAt: null },
  });
  if (!resetCode) throw new ApiError(400, "This reset code has already been used. Start again.");

  const hashed = await bcrypt.hash(newPassword, 10);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: payload.sub },
      // Bumping tokenVersion logs out every other device/session using this
      // account — a password reset should always invalidate old sessions.
      data: { password: hashed, tokenVersion: { increment: 1 } },
    }),
    prisma.passwordResetCode.update({ where: { id: resetCode.id }, data: { usedAt: new Date() } }),
  ]);

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  await recordActivity({
    tenantId: user?.tenantId ?? null,
    userId: payload.sub,
    action: "reset password",
    entityType: "User",
    entityId: payload.sub,
  });

  sendResponse(res, 200, "Password reset successfully. You can now log in with your new password.", null);
}

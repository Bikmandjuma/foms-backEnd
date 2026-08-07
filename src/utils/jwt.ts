import jwt from "jsonwebtoken";

export interface JwtPayload {
  sub: string;
  roleId: string | null;
  tenantId: string | null;
  isPlatformAdmin: boolean;
  tokenVersion: number;
}

const JWT_SECRET = process.env.JWT_SECRET as string;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? "1d";

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"] });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as JwtPayload;
}

// A separate, short-lived, single-purpose token issued only after a user
// proves they own the 6-digit email code — it can do nothing except carry
// them to the "set a new password" step, and only for 10 minutes.
export interface ResetTokenPayload {
  purpose: "password-reset";
  sub: string;
  codeId: string;
}

export function signResetToken(payload: Omit<ResetTokenPayload, "purpose">): string {
  return jwt.sign({ ...payload, purpose: "password-reset" }, JWT_SECRET, { expiresIn: "10m" });
}

export function verifyResetToken(token: string): ResetTokenPayload {
  const decoded = jwt.verify(token, JWT_SECRET) as ResetTokenPayload;
  if (decoded.purpose !== "password-reset") {
    throw new Error("Invalid token purpose");
  }
  return decoded;
}

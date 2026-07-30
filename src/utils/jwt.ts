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

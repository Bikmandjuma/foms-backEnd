import type { Response } from "express";

export function sendResponse<T>(res: Response, statusCode: number, message: string, data: T): Response {
  return res.status(statusCode).json({ statusCode, message, data });
}

import type { NextFunction, Request, Response } from "express";
import { MulterError } from "multer";
import { ZodError } from "zod";
import { sendResponse } from "../utils/apiResponse.js";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function notFoundHandler(req: Request, res: Response): void {
  sendResponse(res, 404, `Not found: ${req.method} ${req.originalUrl}`, null);
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof ZodError) {
    sendResponse(res, 400, "Validation failed", err.flatten());
    return;
  }

  if (err instanceof ApiError) {
    sendResponse(res, err.status, err.message, null);
    return;
  }

  // File uploads (Excel import) reject bad file types/sizes with a plain
  // Error or MulterError before our own handlers ever run — surface those
  // as a clean 400 instead of a generic 500.
  if (err instanceof MulterError) {
    sendResponse(res, 400, err.message, null);
    return;
  }
  if (err instanceof Error && /only \.xlsx files are supported/i.test(err.message)) {
    sendResponse(res, 400, err.message, null);
    return;
  }

  console.error(err);
  sendResponse(res, 500, "Internal server error", null);
}

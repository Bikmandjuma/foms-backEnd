import type { Request, Response } from "express";
import { sendResponse } from "../utils/apiResponse.js";
import { PERMISSION_GROUPS } from "../utils/permissions.js";

export async function listPermissionCatalog(_req: Request, res: Response): Promise<void> {
  sendResponse(res, 200, "Permission catalog retrieved successfully", PERMISSION_GROUPS); 
}

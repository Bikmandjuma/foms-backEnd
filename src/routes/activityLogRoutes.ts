import { Router } from "express";
import { listActivityLogs } from "../controllers/activityLogController.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { authenticate } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permissions.js";

const router = Router();

router.use(authenticate);
router.get("/", requirePermission("activity:view"), asyncHandler(listActivityLogs));

export default router;

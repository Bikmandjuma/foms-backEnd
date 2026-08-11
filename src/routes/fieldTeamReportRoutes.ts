import { Router } from "express";
import { exportFieldTeamReport, listFieldTeamReport } from "../controllers/fieldTeamReportController.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { authenticate } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permissions.js";

const router = Router();

router.use(authenticate);

router.get("/", requirePermission("field-team-reports:view"), asyncHandler(listFieldTeamReport));
router.get("/export", requirePermission("field-team-reports:view"), asyncHandler(exportFieldTeamReport));

export default router;

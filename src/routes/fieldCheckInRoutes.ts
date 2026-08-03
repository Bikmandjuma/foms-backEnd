import { Router } from "express";
import {
  addFieldNote,
  createCheckIn,
  dailyRoster,
  endCheckIn,
  exportDailyReport,
  listCheckIns,
  listFieldNotes,
  listTodayRespondents,
  pingCurrentGps,
  recordVisitOutcome,
} from "../controllers/fieldCheckInController.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { authenticate } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permissions.js";

const router = Router();

router.use(authenticate);
router.get("/", requirePermission("monitoring:view"), asyncHandler(listCheckIns));
router.get("/roster", requirePermission("monitoring:view"), asyncHandler(dailyRoster));
router.get("/export", requirePermission("monitoring:view"), asyncHandler(exportDailyReport));
// Anyone authenticated can check themself in/out — this is a field action,
// not an admin one. Only listing/roster/export (monitoring) is permission-gated.
router.post("/", asyncHandler(createCheckIn));
router.post("/:id/end", asyncHandler(endCheckIn));
router.post("/:id/gps", asyncHandler(pingCurrentGps));
router.get("/:id/respondents", asyncHandler(listTodayRespondents));
router.put("/:id/respondents/:beneficiaryId", asyncHandler(recordVisitOutcome));
router.get("/:id/notes", asyncHandler(listFieldNotes));
router.post("/:id/notes", asyncHandler(addFieldNote));

export default router;

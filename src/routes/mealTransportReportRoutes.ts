import { Router } from "express";
import {
  listMealTransportConfigs,
  upsertMealTransportConfig,
  deleteMealTransportConfig,
  getMyMealTransportConfig,
  getOrCreateCurrentWeekReport,
  listMyMealTransportReports,
  listMealTransportReports,
  getMealTransportReport,
  upsertMealTransportEntry,
  deleteMealTransportEntry,
  signAsPreparer,
  signAsApprover,
  exportMealTransportReport,
} from "../controllers/mealTransportReportController.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { authenticate } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permissions.js";

const router = Router();

router.use(authenticate);

// Listing configs is readable by manage OR create permission holders (a
// create-only person still needs project names for their own "which
// project?" picker) — checked inside the controller. Writing configs
// stays manage-only.
router.get("/config", asyncHandler(listMealTransportConfigs));
router.put("/config", requirePermission("meal-transport-reports:manage"), asyncHandler(upsertMealTransportConfig));
router.delete("/config/:id", requirePermission("meal-transport-reports:manage"), asyncHandler(deleteMealTransportConfig));

// Self-service — same convention as field-expenses/availability-checks: no
// admin permission needed to see whether your own role is configured, or
// to work with your own weekly reports. Access to someone else's report is
// checked inside the controller (preparer, assigned approver, or manage
// permission), not gated by route-level permission.
router.get("/my-config", asyncHandler(getMyMealTransportConfig));
router.get("/mine", asyncHandler(listMyMealTransportReports));
router.post("/current-week", asyncHandler(getOrCreateCurrentWeekReport));

// Not gated by manage permission — the controller itself scopes results to
// "everything" for a manager, or "only where I'm the assigned approver"
// for anyone else, so a Supervisor who isn't a platform/tenant admin can
// still see what's awaiting their own signature.
router.get("/", asyncHandler(listMealTransportReports));
router.get("/:id", asyncHandler(getMealTransportReport));
router.put("/:id/entries", asyncHandler(upsertMealTransportEntry));
router.delete("/:id/entries/:entryId", asyncHandler(deleteMealTransportEntry));
router.post("/:id/sign-preparer", asyncHandler(signAsPreparer));
router.post("/:id/sign-approver", asyncHandler(signAsApprover));
router.get("/:id/export", asyncHandler(exportMealTransportReport));

export default router;

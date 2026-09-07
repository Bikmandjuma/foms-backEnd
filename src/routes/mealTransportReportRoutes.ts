import { Router } from "express";
import {
  listMealTransportConfigs,
  upsertMealTransportConfig,
  deleteMealTransportConfig,
  getMyMealTransportConfig,
  listWeeksForProgram,
  createMealTransportReportWeek,
  updateMealTransportReportWeek,
  deleteMealTransportReportWeek,
  listEligibleWeeksForMe,
  getWeekRoleSummary,
  listReportsForWeekAndRole,
  exportWeekRoleZip,
  getOrCreateReportForWeek,
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

// Config: listing is readable by manage OR create permission holders (a
// create-only person still needs project names for their own picker),
// checked inside the controller. Writing configs stays manage-only.
router.get("/config", asyncHandler(listMealTransportConfigs));
router.put("/config", requirePermission("meal-transport-reports:manage"), asyncHandler(upsertMealTransportConfig));
router.delete("/config/:id", requirePermission("meal-transport-reports:manage"), asyncHandler(deleteMealTransportConfig));
router.get("/my-config", asyncHandler(getMyMealTransportConfig));

// Weeks: whoever manages this schedules and enables/disables them, per
// program; everyone else only ever sees the ones already enabled for
// their own role's program.
// Readable by manage OR create permission holders, same as config listing
// above, checked inside the controller.
router.get("/weeks", asyncHandler(listWeeksForProgram));
router.post("/weeks", requirePermission("meal-transport-reports:manage"), asyncHandler(createMealTransportReportWeek));
router.get("/weeks/mine", asyncHandler(listEligibleWeeksForMe));
router.put("/weeks/:id", requirePermission("meal-transport-reports:manage"), asyncHandler(updateMealTransportReportWeek));
router.delete("/weeks/:id", requirePermission("meal-transport-reports:manage"), asyncHandler(deleteMealTransportReportWeek));
router.post("/weeks/:weekId/report", asyncHandler(getOrCreateReportForWeek));
router.get("/weeks/:weekId/summary", requirePermission("meal-transport-reports:manage"), asyncHandler(getWeekRoleSummary));
router.get("/weeks/:weekId/reports", requirePermission("meal-transport-reports:manage"), asyncHandler(listReportsForWeekAndRole));
router.get("/weeks/:weekId/export-zip", requirePermission("meal-transport-reports:manage"), asyncHandler(exportWeekRoleZip));

// Self-service, same convention as field-expenses/availability-checks: no
// admin permission needed to see or work with your own reports. Access to
// someone else's report is checked inside the controller (preparer,
// assigned approver, or manage permission), not gated by route-level
// permission.
router.get("/mine", asyncHandler(listMyMealTransportReports));

// Not gated by manage permission, the controller itself scopes results to
// "everything" for a manager, or "only where I'm the assigned approver"
// for anyone else, so a Supervisor who isn't a platform/tenant admin can
// still browse by week and approve what's assigned to them.
router.get("/", asyncHandler(listMealTransportReports));
router.get("/:id", asyncHandler(getMealTransportReport));
router.put("/:id/entries", asyncHandler(upsertMealTransportEntry));
router.delete("/:id/entries/:entryId", asyncHandler(deleteMealTransportEntry));
router.post("/:id/sign-preparer", asyncHandler(signAsPreparer));
router.post("/:id/sign-approver", asyncHandler(signAsApprover));
router.get("/:id/export", asyncHandler(exportMealTransportReport));

export default router;

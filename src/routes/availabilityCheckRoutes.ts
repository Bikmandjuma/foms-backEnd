import { Router } from "express";
import {
  assignAvailabilityChecks,
  getAvailabilityChecks,
  getNextAvailabilityCheck,
  submitAvailabilityCheck,
  updateAvailabilityCheckConfig,
} from "../controllers/availabilityCheckController.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { authenticate } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permissions.js";

const router = Router();

router.use(authenticate);

router.get("/", requirePermission("assignments:view"), asyncHandler(getAvailabilityChecks));
router.put("/config", requirePermission("assignments:create"), asyncHandler(updateAvailabilityCheckConfig));
router.post("/assign", requirePermission("assignments:create"), asyncHandler(assignAvailabilityChecks));
// Self-service, scoped to the caller — same convention as field-checkins
// (see fieldCheckInRoutes.ts): no admin permission gate needed.
router.get("/next", asyncHandler(getNextAvailabilityCheck));
router.put("/:id", asyncHandler(submitAvailabilityCheck));

export default router;

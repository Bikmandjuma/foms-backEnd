import { Router } from "express";
import { createCheckIn, endCheckIn, listCheckIns } from "../controllers/fieldCheckInController.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { authenticate } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permissions.js";

const router = Router();

router.use(authenticate);
router.get("/", requirePermission("monitoring:view"), asyncHandler(listCheckIns));
// Anyone authenticated can check themself in/out — this is a field action,
// not an admin one. Only listing (monitoring) is permission-gated.
router.post("/", asyncHandler(createCheckIn));
router.post("/:id/end", asyncHandler(endCheckIn));

export default router;

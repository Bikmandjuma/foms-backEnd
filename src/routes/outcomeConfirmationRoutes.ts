import { Router } from "express";
import { confirmVisitOutcome, listPendingOutcomeConfirmations } from "../controllers/outcomeConfirmationController.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { authenticate } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permissions.js";

const router = Router();

router.use(authenticate);
router.get("/", requirePermission("outcomes:view"), asyncHandler(listPendingOutcomeConfirmations));
router.put("/:id", requirePermission("outcomes:confirm"), asyncHandler(confirmVisitOutcome));

export default router;

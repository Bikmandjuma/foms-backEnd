import { Router } from "express";
import {
  createReplacementRequest,
  deleteReplacementRequest,
  listReplacementRequests,
  retryReplacementRequest,
} from "../controllers/replacementController.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { authenticate } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permissions.js";

const router = Router();

router.use(authenticate);
router.get("/", asyncHandler(listReplacementRequests));
// Fully automatic — no approval step. Any authenticated tenant user can
// raise one; the system searches village -> cell -> sector -> district and
// finalizes it in the same request.
router.post("/", asyncHandler(createReplacementRequest));
// Only reachable for the rare case where nothing was available at request
// time — re-runs the same automatic search, not a human approval.
router.post("/:id/retry", asyncHandler(retryReplacementRequest));
router.delete("/:id", requirePermission("replacements:delete"), asyncHandler(deleteReplacementRequest));

export default router;

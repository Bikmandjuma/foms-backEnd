import { Router } from "express";
import {
  createReplacementRequest,
  decideReplacementRequest,
  deleteReplacementRequest,
  getReplacementCandidates,
  listReplacementRequests,
} from "../controllers/replacementController.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { authenticate } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permissions.js";

const router = Router();

router.use(authenticate);
router.get("/", asyncHandler(listReplacementRequests));
router.get("/candidates", asyncHandler(getReplacementCandidates));
router.post("/", asyncHandler(createReplacementRequest));
router.post("/:id/decide", requirePermission("replacements:edit"), asyncHandler(decideReplacementRequest));
router.delete("/:id", requirePermission("replacements:delete"), asyncHandler(deleteReplacementRequest));

export default router;

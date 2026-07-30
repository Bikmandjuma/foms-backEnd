import { Router } from "express";
import {
  createReplacementRequest,
  decideReplacementRequest,
  deleteReplacementRequest,
  listReplacementRequests,
} from "../controllers/replacementController.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { authenticate } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permissions.js";

const router = Router();

router.use(authenticate);
router.get("/", asyncHandler(listReplacementRequests));
router.post("/", asyncHandler(createReplacementRequest));
router.post("/:id/decide", requirePermission("replacements:manage"), asyncHandler(decideReplacementRequest));
router.delete("/:id", requirePermission("replacements:manage"), asyncHandler(deleteReplacementRequest));

export default router;

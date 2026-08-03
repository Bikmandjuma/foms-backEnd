import { Router } from "express";
import { listActivityLogs } from "../controllers/activityLogController.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { authenticate } from "../middleware/auth.js";

const router = Router();

router.use(authenticate);
// No permission gate here — everyone can see their OWN activity. The
// controller itself decides whether to also show everyone else's, based on
// whether the caller holds activity:view.
router.get("/", asyncHandler(listActivityLogs));

export default router;

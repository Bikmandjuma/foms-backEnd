import { Router } from "express";
import { getDashboardSummary } from "../controllers/dashboardController.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { authenticate } from "../middleware/auth.js";

const router = Router();

router.use(authenticate);
router.get("/summary", asyncHandler(getDashboardSummary));

export default router;

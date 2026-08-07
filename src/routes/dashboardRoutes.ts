import { Router } from "express";
import { getDashboardChart, getDashboardSummary, getOnlineUsers } from "../controllers/dashboardController.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { authenticate } from "../middleware/auth.js";

const router = Router();

router.use(authenticate);
router.get("/summary", asyncHandler(getDashboardSummary));
router.get("/online-users", asyncHandler(getOnlineUsers));
router.get("/chart", asyncHandler(getDashboardChart));

export default router;

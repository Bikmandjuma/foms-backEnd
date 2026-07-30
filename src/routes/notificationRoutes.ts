import { Router } from "express";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "../controllers/notificationController.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { authenticate } from "../middleware/auth.js";

const router = Router();

router.use(authenticate);
router.get("/", asyncHandler(listNotifications));
router.post("/read-all", asyncHandler(markAllNotificationsRead));
router.post("/:id/read", asyncHandler(markNotificationRead));

export default router;

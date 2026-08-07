import { Router } from "express";
import { forgotPassword, login, logout, me, resetPassword, verifyResetCode } from "../controllers/authController.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { authenticate } from "../middleware/auth.js";

const router = Router();

router.post("/login", asyncHandler(login));
router.post("/forgot-password", asyncHandler(forgotPassword));
router.post("/verify-reset-code", asyncHandler(verifyResetCode));
router.post("/reset-password", asyncHandler(resetPassword));

router.use(authenticate);
router.post("/logout", asyncHandler(logout));
router.get("/me", asyncHandler(me));

export default router;

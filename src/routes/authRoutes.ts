import { Router } from "express";
import { login, logout, me } from "../controllers/authController.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { authenticate } from "../middleware/auth.js";

const router = Router();

router.post("/login", asyncHandler(login));

router.use(authenticate);
router.post("/logout", asyncHandler(logout));
router.get("/me", asyncHandler(me));

export default router;

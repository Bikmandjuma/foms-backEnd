import { Router } from "express";
import { createUser, deleteUser, getUser, listUsers, updateUser } from "../controllers/userController.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { authenticate } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permissions.js";

const router = Router();

router.use(authenticate);

router.get("/", requirePermission("users:view"), asyncHandler(listUsers));
router.get("/:id", requirePermission("users:view"), asyncHandler(getUser));
router.post("/", requirePermission("users:manage"), asyncHandler(createUser));
router.patch("/:id", requirePermission("users:manage"), asyncHandler(updateUser));
router.delete("/:id", requirePermission("users:manage"), asyncHandler(deleteUser));

export default router;

import { Router } from "express";
import { createUser, deleteUser, getUser, listUsers, updateUser } from "../controllers/userController.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { authenticate } from "../middleware/auth.js";
import { requirePermission, requirePermissionOrSelf } from "../middleware/permissions.js";

const router = Router();

router.use(authenticate);

router.get("/", requirePermission("users:view"), asyncHandler(listUsers));
// Anyone can view/edit their own profile, even without users:view/users:edit
// — only viewing/editing SOMEONE ELSE requires the real permission.
router.get("/:id", requirePermissionOrSelf("users:view"), asyncHandler(getUser));
router.post("/", requirePermission("users:create"), asyncHandler(createUser));
router.patch("/:id", requirePermissionOrSelf("users:edit"), asyncHandler(updateUser));
// Deleting is never self-service, regardless of who it is — no self bypass here.
router.delete("/:id", requirePermission("users:delete"), asyncHandler(deleteUser));

export default router;

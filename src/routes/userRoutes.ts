import { Router } from "express";
import {
  createUser,
  deleteUser,
  getUser,
  listUsers,
  updateUser,
  uploadMyAvatar,
  changeMyPassword,
  importUserGroups,
  downloadUserGroupsTemplate,
} from "../controllers/userController.js";
import { uploadExcel } from "../middleware/upload.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { authenticate } from "../middleware/auth.js";
import { requirePermission, requirePermissionOrSelf } from "../middleware/permissions.js";
import { uploadAvatar } from "../middleware/uploadAvatar.js";

const router = Router();

router.use(authenticate);

router.get("/", requirePermission("users:view"), asyncHandler(listUsers));
router.get("/import-groups/template", requirePermission("users:create"), asyncHandler(downloadUserGroupsTemplate));
router.post("/import-groups", requirePermission("users:create"), uploadExcel.single("file"), asyncHandler(importUserGroups));
// Anyone can view/edit their own profile, even without users:view/users:edit
// — only viewing/editing SOMEONE ELSE requires the real permission.
router.get("/:id", requirePermissionOrSelf("users:view"), asyncHandler(getUser));
router.post("/", requirePermission("users:create"), asyncHandler(createUser));
router.post("/me/avatar", uploadAvatar.single("avatar"), asyncHandler(uploadMyAvatar));
router.post("/me/change-password", asyncHandler(changeMyPassword));
router.patch("/:id", requirePermissionOrSelf("users:edit"), asyncHandler(updateUser));
// Deleting is never self-service, regardless of who it is — no self bypass here.
router.delete("/:id", requirePermission("users:delete"), asyncHandler(deleteUser));

export default router;

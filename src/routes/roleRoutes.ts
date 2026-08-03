import { Router } from "express";
import { createRole, deleteRole, getRole, listRoles, updateRole } from "../controllers/roleController.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { authenticate } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permissions.js";

const router = Router();

router.use(authenticate);

router.get("/", requirePermission("roles:view"), asyncHandler(listRoles));
router.get("/:id", requirePermission("roles:view"), asyncHandler(getRole));
router.post("/", requirePermission("roles:create"), asyncHandler(createRole));
router.patch("/:id", requirePermission("roles:edit"), asyncHandler(updateRole));
router.delete("/:id", requirePermission("roles:delete"), asyncHandler(deleteRole));

export default router;

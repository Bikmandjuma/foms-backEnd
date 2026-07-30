import { Router } from "express";
import {
  createProgram,
  deleteProgram,
  getProgram,
  listPrograms,
  updateProgram,
} from "../controllers/programController.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { authenticate } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permissions.js";

const router = Router();

router.use(authenticate);

router.get("/", requirePermission("programs:view"), asyncHandler(listPrograms));
router.get("/:id", requirePermission("programs:view"), asyncHandler(getProgram));
router.post("/", requirePermission("programs:manage"), asyncHandler(createProgram));
router.patch("/:id", requirePermission("programs:manage"), asyncHandler(updateProgram));
router.delete("/:id", requirePermission("programs:manage"), asyncHandler(deleteProgram));

export default router;

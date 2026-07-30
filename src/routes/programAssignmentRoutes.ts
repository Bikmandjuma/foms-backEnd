import { Router } from "express";
import {
  createProgramAssignment,
  deleteProgramAssignment,
  endProgramAssignment,
  listProgramAssignments,
} from "../controllers/programAssignmentController.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { authenticate } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permissions.js";

const router = Router();

router.use(authenticate);

router.get("/", requirePermission("assignments:view"), asyncHandler(listProgramAssignments));
router.post("/", requirePermission("assignments:manage"), asyncHandler(createProgramAssignment));
router.post("/:id/end", requirePermission("assignments:manage"), asyncHandler(endProgramAssignment));
router.delete("/:id", requirePermission("assignments:manage"), asyncHandler(deleteProgramAssignment));

export default router;

import { Router } from "express";
import {
  bulkCreateProgramAssignments,
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
router.post("/", requirePermission("assignments:create"), asyncHandler(createProgramAssignment));
router.post("/bulk", requirePermission("assignments:create"), asyncHandler(bulkCreateProgramAssignments));
router.post("/:id/end", requirePermission("assignments:edit"), asyncHandler(endProgramAssignment));
router.delete("/:id", requirePermission("assignments:delete"), asyncHandler(deleteProgramAssignment));

export default router;

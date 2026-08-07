import { Router } from "express";
import {
  autoAssignBeneficiaries,
  createBeneficiaryAssignment,
  deleteBeneficiaryAssignment,
  endBeneficiaryAssignment,
  exportAssignmentReport,
  listBeneficiaryAssignments,
} from "../controllers/beneficiaryAssignmentController.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { authenticate } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permissions.js";

const router = Router();

router.use(authenticate);

router.get("/", requirePermission("assignments:view"), asyncHandler(listBeneficiaryAssignments));
router.get("/report", requirePermission("assignments:view"), asyncHandler(exportAssignmentReport));
router.post("/", requirePermission("assignments:create"), asyncHandler(createBeneficiaryAssignment));
router.post("/auto-assign", requirePermission("assignments:create"), asyncHandler(autoAssignBeneficiaries));
router.post("/:id/end", requirePermission("assignments:edit"), asyncHandler(endBeneficiaryAssignment));
router.delete("/:id", requirePermission("assignments:delete"), asyncHandler(deleteBeneficiaryAssignment));

export default router;

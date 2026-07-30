import { Router } from "express";
import {
  createBeneficiaryAssignment,
  deleteBeneficiaryAssignment,
  endBeneficiaryAssignment,
  listBeneficiaryAssignments,
} from "../controllers/beneficiaryAssignmentController.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { authenticate } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permissions.js";

const router = Router();

router.use(authenticate);

router.get("/", requirePermission("assignments:view"), asyncHandler(listBeneficiaryAssignments));
router.post("/", requirePermission("assignments:manage"), asyncHandler(createBeneficiaryAssignment));
router.post("/:id/end", requirePermission("assignments:manage"), asyncHandler(endBeneficiaryAssignment));
router.delete("/:id", requirePermission("assignments:manage"), asyncHandler(deleteBeneficiaryAssignment));

export default router;

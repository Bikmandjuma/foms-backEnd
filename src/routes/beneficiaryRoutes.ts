import { Router } from "express";
import {
  createBeneficiary,
  deleteBeneficiary,
  getBeneficiary,
  listBeneficiaries,
  updateBeneficiary,
} from "../controllers/beneficiaryController.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { authenticate } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permissions.js";

const router = Router();

router.use(authenticate);

router.get("/", requirePermission("beneficiaries:view"), asyncHandler(listBeneficiaries));
router.get("/:id", requirePermission("beneficiaries:view"), asyncHandler(getBeneficiary));
router.post("/", requirePermission("beneficiaries:manage"), asyncHandler(createBeneficiary));
router.patch("/:id", requirePermission("beneficiaries:manage"), asyncHandler(updateBeneficiary));
router.delete("/:id", requirePermission("beneficiaries:manage"), asyncHandler(deleteBeneficiary));

export default router;

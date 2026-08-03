import { Router } from "express";
import {
  createBeneficiary,
  deleteBeneficiary,
  downloadBeneficiaryTemplate,
  getBeneficiary,
  importBeneficiaries,
  listBeneficiaries,
  updateBeneficiary,
} from "../controllers/beneficiaryController.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { authenticate } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permissions.js";
import { uploadExcel } from "../middleware/upload.js";

const router = Router();

router.use(authenticate);

router.get("/", requirePermission("beneficiaries:view"), asyncHandler(listBeneficiaries));
router.get("/import/template", requirePermission("beneficiaries:create"), asyncHandler(downloadBeneficiaryTemplate));
router.post(
  "/import",
  requirePermission("beneficiaries:create"),
  uploadExcel.single("file"),
  asyncHandler(importBeneficiaries)
);
router.get("/:id", requirePermission("beneficiaries:view"), asyncHandler(getBeneficiary));
router.post("/", requirePermission("beneficiaries:create"), asyncHandler(createBeneficiary));
router.patch("/:id", requirePermission("beneficiaries:edit"), asyncHandler(updateBeneficiary));
router.delete("/:id", requirePermission("beneficiaries:delete"), asyncHandler(deleteBeneficiary));

export default router;

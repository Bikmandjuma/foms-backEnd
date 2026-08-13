import { Router } from "express";
import {
  createFieldExpense,
  deleteFieldExpense,
  getFieldExpense,
  listFieldExpenses,
  listMyFieldExpenses,
  reviewFieldExpense,
} from "../controllers/fieldExpenseController.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { authenticate } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permissions.js";
import { uploadExpenseDocument } from "../middleware/uploadExpenseDocument.js";

const router = Router();

router.use(authenticate);

router.get("/", requirePermission("expenses:view"), asyncHandler(listFieldExpenses));
// Self-service, scoped to the caller — same convention as field-checkins /
// availability-checks: no admin permission gate needed to submit or list
// your own expenses.
router.get("/mine", asyncHandler(listMyFieldExpenses));
router.post("/", uploadExpenseDocument.single("document"), asyncHandler(createFieldExpense));
router.get("/:id", requirePermission("expenses:view"), asyncHandler(getFieldExpense));
router.put("/:id/review", requirePermission("expenses:edit"), asyncHandler(reviewFieldExpense));
router.delete("/:id", requirePermission("expenses:delete"), asyncHandler(deleteFieldExpense));

export default router;

import { Router } from "express";
import {
  createTenant,
  deleteTenant,
  getTenant,
  listTenants,
  updateTenant,
} from "../controllers/tenantController.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { authenticate, requirePlatformAdmin } from "../middleware/auth.js";

const router = Router();

router.use(authenticate, requirePlatformAdmin);

router.get("/", asyncHandler(listTenants));
router.post("/", asyncHandler(createTenant));
router.get("/:id", asyncHandler(getTenant));
router.patch("/:id", asyncHandler(updateTenant));
router.delete("/:id", asyncHandler(deleteTenant));

export default router;

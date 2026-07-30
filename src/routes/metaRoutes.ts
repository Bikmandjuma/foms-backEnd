import { Router } from "express";
import { listPermissionCatalog } from "../controllers/metaController.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { authenticate } from "../middleware/auth.js";

const router = Router();

router.use(authenticate);
router.get("/permissions", asyncHandler(listPermissionCatalog));

export default router;

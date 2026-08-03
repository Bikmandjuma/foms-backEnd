import { Router } from "express";
import { createVehicle, deleteVehicle, getVehicle, listVehicles, updateVehicle } from "../controllers/vehicleController.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { authenticate } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permissions.js";

const router = Router();

router.use(authenticate);

router.get("/", requirePermission("vehicles:view"), asyncHandler(listVehicles));
router.get("/:id", requirePermission("vehicles:view"), asyncHandler(getVehicle));
router.post("/", requirePermission("vehicles:create"), asyncHandler(createVehicle));
router.patch("/:id", requirePermission("vehicles:edit"), asyncHandler(updateVehicle));
router.delete("/:id", requirePermission("vehicles:delete"), asyncHandler(deleteVehicle));

export default router;

import { Router } from "express";
import { listCells, listDistricts, listProvinces, listSectors, listVillages } from "../controllers/geoController.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { authenticate } from "../middleware/auth.js";

const router = Router();

router.use(authenticate);
router.get("/provinces", asyncHandler(listProvinces));
router.get("/districts", asyncHandler(listDistricts));
router.get("/sectors", asyncHandler(listSectors));
router.get("/cells", asyncHandler(listCells));
router.get("/villages", asyncHandler(listVillages));

export default router;

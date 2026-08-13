import { Router } from "express";
import {
  addProgramTeamMember,
  addProgramTeamVehicle,
  adoptGroup,
  assignRandomRespondentToGroupMember,
  autoAssignProgramTeamVehicles,
  clearProgramTeamLeader,
  getProgramTeams,
  listImportedGroups,
  removeProgramTeamMember,
  removeProgramTeamVehicle,
  runProgramAssignment,
  setProgramTeamLeader,
  updateProgramTeamConfig,
} from "../controllers/programTeamController.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { authenticate } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permissions.js";

const router = Router();

router.use(authenticate);

router.get("/", requirePermission("teams:view"), asyncHandler(getProgramTeams));
router.get("/groups", requirePermission("teams:view"), asyncHandler(listImportedGroups));
router.post("/groups/adopt", requirePermission("teams:create"), asyncHandler(adoptGroup));
router.post("/:teamId/members/:userId/assign-random", requirePermission("teams:edit"), asyncHandler(assignRandomRespondentToGroupMember));
router.put("/config", requirePermission("teams:create"), asyncHandler(updateProgramTeamConfig));
router.post("/run", requirePermission("teams:create"), asyncHandler(runProgramAssignment));
router.post("/:teamId/leader", requirePermission("teams:edit"), asyncHandler(setProgramTeamLeader));
router.delete("/:teamId/leader", requirePermission("teams:edit"), asyncHandler(clearProgramTeamLeader));
router.post("/:teamId/members", requirePermission("teams:edit"), asyncHandler(addProgramTeamMember));
router.delete("/:teamId/members/:userId", requirePermission("teams:delete"), asyncHandler(removeProgramTeamMember));
router.post("/auto-assign-vehicles", requirePermission("teams:edit"), asyncHandler(autoAssignProgramTeamVehicles));
router.post("/:teamId/vehicles", requirePermission("teams:edit"), asyncHandler(addProgramTeamVehicle));
router.delete("/:teamId/vehicles/:vehicleId", requirePermission("teams:delete"), asyncHandler(removeProgramTeamVehicle));

export default router;

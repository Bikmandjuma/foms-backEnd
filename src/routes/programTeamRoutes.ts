import { Router } from "express";
import {
  addProgramTeamMember,
  addProgramTeamVehicle,
  assignRespondentsToProgram,
  autoAssignProgramTeamVehicles,
  clearProgramTeamLeader,
  getEligibleRespondents,
  getMyProgramTeam,
  getProgramTeams,
  getProgramTeamsForUser,
  listMyLedPrograms,
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
router.get("/for-user", requirePermission("teams:view"), asyncHandler(getProgramTeamsForUser));
router.get("/eligible-respondents", requirePermission("teams:view"), asyncHandler(getEligibleRespondents));
router.post("/enroll-respondents", requirePermission("teams:create"), asyncHandler(assignRespondentsToProgram));
// Self-service, scoped to the caller — same convention as field-checkins /
// availability-checks: no admin permission gate needed.
router.get("/mine", asyncHandler(getMyProgramTeam));
router.get("/led", asyncHandler(listMyLedPrograms));
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

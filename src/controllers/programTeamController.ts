import type { Request, Response } from "express";
import { requireTenantId } from "../middleware/auth.js";
import { ApiError } from "../middleware/errorHandler.js";
import { sendResponse } from "../utils/apiResponse.js";
import { prisma } from "../utils/prisma.js";
import {
  addProgramTeamMemberSchema,
  addProgramTeamVehicleSchema,
  assignRespondentsToProgramSchema,
  programTeamProgramIdSchema,
  setProgramTeamLeaderSchema,
  updateProgramTeamConfigSchema,
} from "../utils/validators.js";
import { recordActivity } from "../utils/activityLog.js";
import { notifyUser } from "../utils/notifications.js";
import { computeMatchLevel, rankMatchLevel, shuffle, type GeoLocation } from "../utils/geo.js";

const userBrief = { select: { id: true, name: true, email: true, telephone: true } } as const;
const vehicleBrief = { select: { id: true, name: true, type: true, driverName: true, capacityPerDay: true } } as const;

const teamInclude = {
  leader: userBrief,
  members: { include: { user: userBrief } },
  vehicles: { include: { vehicle: vehicleBrief } },
} as const;

const geoUserSelect = {
  id: true,
  name: true,
  email: true,
  provinceId: true,
  districtId: true,
  sectorId: true,
  cellId: true,
} as const;

type GeoUser = { id: string; name: string | null; email: string } & GeoLocation;
type TierKey = "cellId" | "sectorId" | "districtId" | "provinceId";
const TIER_KEYS: TierKey[] = ["cellId", "sectorId", "districtId", "provinceId"];

function loc(x: GeoLocation): GeoLocation {
  return { provinceId: x.provinceId, districtId: x.districtId, sectorId: x.sectorId, cellId: x.cellId };
}

/** Every geo tier is capped at cell — village is intentionally never compared for this engine. */
function bestGeoMatches<T extends GeoLocation>(target: GeoLocation, pool: T[]): T[] {
  if (pool.length === 0) return [];
  let bestRank = Infinity;
  let best: T[] = [];
  for (const item of pool) {
    const rank = rankMatchLevel(computeMatchLevel(target, loc(item)));
    if (rank < bestRank) {
      bestRank = rank;
      best = [item];
    } else if (rank === bestRank) {
      best.push(item);
    }
  }
  return best;
}

function mostCommon(values: (number | null | undefined)[]): number | undefined {
  const counts = new Map<number, number>();
  for (const v of values) {
    if (v == null) continue;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  let best: number | undefined;
  let bestCount = 0;
  for (const [v, c] of counts) {
    if (c > bestCount) {
      best = v;
      bestCount = c;
    }
  }
  return best;
}

function teamRepresentativeLocation(members: GeoLocation[]): GeoLocation {
  return {
    cellId: mostCommon(members.map((m) => m.cellId)),
    sectorId: mostCommon(members.map((m) => m.sectorId)),
    districtId: mostCommon(members.map((m) => m.districtId)),
    provinceId: mostCommon(members.map((m) => m.provinceId)),
  };
}

function teamIdParam(req: Request): string {
  return req.params.teamId as string;
}

/**
 * Placing someone into a team (as leader or member), or pulling them onto the
 * program via the assignment engine, guarantees they show up wherever the
 * rest of the app already reads "who's staffed on this program" — purely
 * additive, never ends an existing assignment. Returns whether a new
 * assignment was actually created, so callers can notify only newly-touched
 * users instead of re-notifying everyone on every re-run.
 */
async function ensureProgramAssignment(tenantId: string, userId: string, programId: string): Promise<boolean> {
  const existing = await prisma.programAssignment.findFirst({ where: { userId, programId, status: "ACTIVE" } });
  if (existing) return false;
  await prisma.programAssignment.create({ data: { userId, programId, tenantId } });
  return true;
}

async function loadProgramOrThrow(programId: string, tenantId: string) {
  const program = await prisma.program.findFirst({ where: { id: programId, tenantId } });
  if (!program) throw new ApiError(400, "programId does not belong to your tenant");
  return program;
}

/**
 * Count of active beneficiaries enrolled in this program that don't yet have
 * a non-pending tracing (AvailabilityCheck) result — i.e. never checked, or
 * checked but still PENDING. Used to gate the assignment engine on programs
 * where tracing is required.
 */
async function countPendingTracing(tenantId: string, programId: string): Promise<number> {
  return prisma.beneficiary.count({
    where: {
      tenantId,
      status: "ACTIVE",
      programs: { some: { id: programId } },
      NOT: { availabilityChecks: { some: { programId, status: { not: "PENDING" } } } },
    },
  });
}

export async function getProgramTeams(req: Request, res: Response): Promise<void> {
  const tenantId = requireTenantId(req);
  const { programId } = req.query;
  if (typeof programId !== "string" || !programId) {
    throw new ApiError(400, "programId query parameter is required");
  }

  const program = await prisma.program.findFirst({
    where: { id: programId, tenantId },
    select: {
      id: true,
      name: true,
      teamCount: true,
      membersPerTeam: true,
      teamLeaderRoleId: true,
      teamMemberRoleId: true,
      teamLeaderRole: { select: { id: true, name: true } },
      teamMemberRole: { select: { id: true, name: true } },
      tracingRequired: true,
    },
  });
  if (!program) throw new ApiError(404, "Program not found");

  const [teams, tracingPendingCount] = await Promise.all([
    prisma.programTeam.findMany({
      where: { programId },
      include: teamInclude,
      orderBy: { createdAt: "asc" },
    }),
    program.tracingRequired ? countPendingTracing(tenantId, programId) : Promise.resolve(0),
  ]);

  sendResponse(res, 200, "Program teams retrieved successfully", { program, teams, tracingPendingCount });
}

/**
 * GET /program-teams/mine?programId= — self-service, scoped entirely to the
 * caller (same convention as field-checkins / availability-checks: no admin
 * permission gate). Returns the one group the caller belongs to for this
 * program — as a member or as its leader — with who leads it, who's on it,
 * and which vehicle(s) are assigned to it. Null if they're not on a group
 * for this program (e.g. the assignment engine hasn't run yet, or they're
 * an enumerator not yet placed into a team).
 */
export async function getMyProgramTeam(req: Request, res: Response): Promise<void> {
  const tenantId = requireTenantId(req);
  const userId = req.user!.sub;
  const { programId } = req.query;
  if (typeof programId !== "string" || !programId) {
    throw new ApiError(400, "programId query parameter is required");
  }

  const team = await prisma.programTeam.findFirst({
    where: {
      tenantId,
      programId,
      OR: [{ leaderId: userId }, { members: { some: { userId } } }],
    },
    include: teamInclude,
  });

  sendResponse(res, 200, "Your group retrieved successfully", team);
}

/**
 * GET /program-teams/led — every program this caller personally leads
 * (leaderId only, not member), across the whole tenant. Self-service like
 * getMyProgramTeam (no permission gate — it's the caller's own standing),
 * but leader-only and program-scoped rather than one-program-at-a-time —
 * this is what lets the mobile app's dashboard know which programs' rosters
 * to pull for a "my supervised programs today" summary.
 */
export async function listMyLedPrograms(req: Request, res: Response): Promise<void> {
  const tenantId = requireTenantId(req);
  const userId = req.user!.sub;

  const teams = await prisma.programTeam.findMany({
    where: { tenantId, leaderId: userId },
    select: { id: true, name: true, program: { select: { id: true, name: true } } },
    orderBy: { name: "asc" },
  });

  sendResponse(res, 200, "Your led programs retrieved successfully", teams);
}

/**
 * GET /program-teams/for-user?userId= — admin view (User Profile page):
 * every group this user belongs to, as leader or member, across every
 * program — unlike getMyProgramTeam this deliberately isn't scoped to one
 * program, since the point here is showing an admin the user's whole
 * standing at a glance.
 */
export async function getProgramTeamsForUser(req: Request, res: Response): Promise<void> {
  const tenantId = requireTenantId(req);
  const { userId } = req.query;
  if (typeof userId !== "string" || !userId) {
    throw new ApiError(400, "userId query parameter is required");
  }

  const teams = await prisma.programTeam.findMany({
    where: {
      tenantId,
      OR: [{ leaderId: userId }, { members: { some: { userId } } }],
    },
    include: {
      ...teamInclude,
      program: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  sendResponse(res, 200, "Groups retrieved successfully", teams);
}

/**
 * Persists the per-program team config: which role is "supervisor", which
 * role is "enumerator", and the target group size. Team *count* is no
 * longer set here — it's derived live from how many active enumerators
 * exist whenever the assignment engine runs (see runProgramAssignment).
 */
export async function updateProgramTeamConfig(req: Request, res: Response): Promise<void> {
  const data = updateProgramTeamConfigSchema.parse(req.body);
  const tenantId = requireTenantId(req);

  if (data.teamLeaderRoleId === data.teamMemberRoleId) {
    throw new ApiError(400, "Team leader role and team member role must be different");
  }

  const program = await loadProgramOrThrow(data.programId, tenantId);

  const [leaderRole, memberRole] = await Promise.all([
    prisma.role.findFirst({ where: { id: data.teamLeaderRoleId, tenantId } }),
    prisma.role.findFirst({ where: { id: data.teamMemberRoleId, tenantId } }),
  ]);
  if (!leaderRole) throw new ApiError(400, "teamLeaderRoleId does not belong to your tenant");
  if (!memberRole) throw new ApiError(400, "teamMemberRoleId does not belong to your tenant");

  await prisma.program.update({
    where: { id: program.id },
    data: {
      membersPerTeam: data.membersPerTeam,
      teamLeaderRoleId: data.teamLeaderRoleId,
      teamMemberRoleId: data.teamMemberRoleId,
    },
  });

  await recordActivity({
    tenantId,
    userId: req.user!.sub,
    action: "configured teams for",
    entityType: "Program",
    entityId: program.id,
    metadata: { program: program.name, membersPerTeam: data.membersPerTeam },
  });

  const teams = await prisma.programTeam.findMany({ where: { programId: program.id }, include: teamInclude, orderBy: { createdAt: "asc" } });
  sendResponse(res, 200, "Team configuration saved successfully", { teams });
}

export async function setProgramTeamLeader(req: Request, res: Response): Promise<void> {
  const data = setProgramTeamLeaderSchema.parse(req.body);
  const tenantId = requireTenantId(req);

  const team = await prisma.programTeam.findFirst({
    where: { id: teamIdParam(req), tenantId },
    include: { program: { select: { id: true, name: true, teamLeaderRoleId: true } } },
  });
  if (!team) throw new ApiError(404, "Team not found");
  if (!team.program.teamLeaderRoleId) throw new ApiError(400, "Configure a team leader role for this program first");

  const user = await prisma.user.findFirst({ where: { id: data.userId, tenantId }, select: { id: true, name: true, email: true, roleId: true } });
  if (!user) throw new ApiError(400, "userId does not belong to your tenant");
  if (user.roleId !== team.program.teamLeaderRoleId) {
    throw new ApiError(400, "This user doesn't hold the configured team leader role");
  }

  const [leadingElsewhere, memberElsewhere] = await Promise.all([
    prisma.programTeam.findFirst({ where: { programId: team.programId, leaderId: user.id, id: { not: team.id } }, select: { name: true } }),
    prisma.programTeamMember.findFirst({ where: { programId: team.programId, userId: user.id }, select: { team: { select: { name: true } } } }),
  ]);
  if (leadingElsewhere) throw new ApiError(409, `This user is already leading "${leadingElsewhere.name}"`);
  if (memberElsewhere) throw new ApiError(409, `This user is already a member of "${memberElsewhere.team.name}" — remove them from that team first`);

  await prisma.programTeam.update({ where: { id: team.id }, data: { leaderId: user.id } });
  await ensureProgramAssignment(tenantId, user.id, team.programId);

  await recordActivity({
    tenantId,
    userId: req.user!.sub,
    action: "assigned as team leader",
    entityType: "ProgramTeam",
    entityId: team.id,
    metadata: { team: team.name, program: team.program.name, user: user.name ?? user.email },
  });

  await notifyUser({
    tenantId,
    userId: user.id,
    type: "ASSIGNMENT_PROGRAM",
    message: `You've been assigned as leader of "${team.name}" for "${team.program.name}"`,
    entityType: "Program",
    entityId: team.programId,
  });

  const updated = await prisma.programTeam.findUnique({ where: { id: team.id }, include: teamInclude });
  sendResponse(res, 200, "Team leader assigned successfully", updated);
}

export async function clearProgramTeamLeader(req: Request, res: Response): Promise<void> {
  const tenantId = requireTenantId(req);
  const team = await prisma.programTeam.findFirst({ where: { id: teamIdParam(req), tenantId } });
  if (!team) throw new ApiError(404, "Team not found");

  const updated = await prisma.programTeam.update({ where: { id: team.id }, data: { leaderId: null }, include: teamInclude });
  sendResponse(res, 200, "Team leader cleared successfully", updated);
}

/** Manual one-off add — kept for the rare correction, same role as createBeneficiaryAssignment. */
export async function addProgramTeamMember(req: Request, res: Response): Promise<void> {
  const data = addProgramTeamMemberSchema.parse(req.body);
  const tenantId = requireTenantId(req);

  const team = await prisma.programTeam.findFirst({
    where: { id: teamIdParam(req), tenantId },
    include: { members: { select: { id: true } }, program: { select: { id: true, name: true, teamMemberRoleId: true, membersPerTeam: true } } },
  });
  if (!team) throw new ApiError(404, "Team not found");
  if (!team.program.teamMemberRoleId) throw new ApiError(400, "Configure a team member role for this program first");
  if (team.program.membersPerTeam != null && team.members.length >= team.program.membersPerTeam) {
    throw new ApiError(409, `"${team.name}" is already at its target size`);
  }

  const user = await prisma.user.findFirst({ where: { id: data.userId, tenantId }, select: { id: true, name: true, email: true, roleId: true } });
  if (!user) throw new ApiError(400, "userId does not belong to your tenant");
  if (user.roleId !== team.program.teamMemberRoleId) {
    throw new ApiError(400, "This user doesn't hold the configured team member role");
  }

  const [leadingHere, memberElsewhere] = await Promise.all([
    prisma.programTeam.findFirst({ where: { programId: team.programId, leaderId: user.id }, select: { name: true } }),
    prisma.programTeamMember.findFirst({ where: { programId: team.programId, userId: user.id }, select: { team: { select: { name: true } } } }),
  ]);
  if (leadingHere) throw new ApiError(409, `This user is already leading "${leadingHere.name}"`);
  if (memberElsewhere) throw new ApiError(409, `This user is already a member of "${memberElsewhere.team.name}"`);

  await prisma.programTeamMember.create({ data: { teamId: team.id, programId: team.programId, userId: user.id } });
  await ensureProgramAssignment(tenantId, user.id, team.programId);

  await recordActivity({
    tenantId,
    userId: req.user!.sub,
    action: "added as team member",
    entityType: "ProgramTeam",
    entityId: team.id,
    metadata: { team: team.name, program: team.program.name, user: user.name ?? user.email },
  });

  await notifyUser({
    tenantId,
    userId: user.id,
    type: "ASSIGNMENT_PROGRAM",
    message: `You've been added to "${team.name}" for "${team.program.name}"`,
    entityType: "Program",
    entityId: team.programId,
  });

  const updated = await prisma.programTeam.findUnique({ where: { id: team.id }, include: teamInclude });
  sendResponse(res, 201, "Team member added successfully", updated);
}

export async function removeProgramTeamMember(req: Request, res: Response): Promise<void> {
  const tenantId = requireTenantId(req);
  const userId = req.params.userId as string;

  const team = await prisma.programTeam.findFirst({ where: { id: teamIdParam(req), tenantId } });
  if (!team) throw new ApiError(404, "Team not found");

  const member = await prisma.programTeamMember.findFirst({ where: { teamId: team.id, userId } });
  if (!member) throw new ApiError(404, "This user is not a member of this team");

  await prisma.programTeamMember.delete({ where: { id: member.id } });

  await recordActivity({
    tenantId,
    userId: req.user!.sub,
    action: "removed team member",
    entityType: "ProgramTeam",
    entityId: team.id,
    metadata: { team: team.name },
  });

  sendResponse(res, 200, "Team member removed successfully", null);
}

/** Manual one-off — pick a specific vehicle for a specific group. A vehicle can only ride for one group at a time, tenant-wide. */
export async function addProgramTeamVehicle(req: Request, res: Response): Promise<void> {
  const data = addProgramTeamVehicleSchema.parse(req.body);
  const tenantId = requireTenantId(req);

  const team = await prisma.programTeam.findFirst({ where: { id: teamIdParam(req), tenantId }, include: { program: { select: { name: true } } } });
  if (!team) throw new ApiError(404, "Team not found");

  const vehicle = await prisma.vehicle.findFirst({ where: { id: data.vehicleId, tenantId } });
  if (!vehicle) throw new ApiError(400, "vehicleId does not belong to your tenant");
  if (!vehicle.active) throw new ApiError(400, "This vehicle is marked inactive");

  const existing = await prisma.programTeamVehicle.findFirst({ where: { vehicleId: vehicle.id }, include: { team: { select: { id: true, name: true } } } });
  if (existing) {
    throw new ApiError(
      409,
      existing.team.id === team.id ? `"${vehicle.name}" is already assigned to this group` : `"${vehicle.name}" is already assigned to "${existing.team.name}"`
    );
  }

  await prisma.programTeamVehicle.create({ data: { teamId: team.id, vehicleId: vehicle.id } });

  await recordActivity({
    tenantId,
    userId: req.user!.sub,
    action: "assigned vehicle to group",
    entityType: "ProgramTeam",
    entityId: team.id,
    metadata: { team: team.name, program: team.program.name, vehicle: vehicle.name },
  });

  const updated = await prisma.programTeam.findUnique({ where: { id: team.id }, include: teamInclude });
  sendResponse(res, 201, "Vehicle assigned successfully", updated);
}

export async function removeProgramTeamVehicle(req: Request, res: Response): Promise<void> {
  const tenantId = requireTenantId(req);
  const vehicleId = req.params.vehicleId as string;

  const team = await prisma.programTeam.findFirst({ where: { id: teamIdParam(req), tenantId } });
  if (!team) throw new ApiError(404, "Team not found");

  const link = await prisma.programTeamVehicle.findFirst({ where: { teamId: team.id, vehicleId } });
  if (!link) throw new ApiError(404, "This vehicle is not assigned to this group");

  await prisma.programTeamVehicle.delete({ where: { id: link.id } });

  await recordActivity({
    tenantId,
    userId: req.user!.sub,
    action: "removed vehicle from group",
    entityType: "ProgramTeam",
    entityId: team.id,
    metadata: { team: team.name },
  });

  sendResponse(res, 200, "Vehicle removed successfully", null);
}

/**
 * Fills every group in the program that has no vehicle yet (top-up, same as
 * every other phase in this feature — never touches a group already
 * covered). Sized off headcount = members + leader (everyone who needs a
 * seat). For each group, tries to find the smallest single available
 * vehicle whose capacity alone covers the group; only when no single
 * vehicle is big enough does it fall back to combining multiple vehicles
 * (largest first) until the group's headcount is covered or the pool runs
 * out. Vehicles with no recorded capacity are skipped here — there's no
 * safe way to bin-pack an unknown seat count — and must be assigned
 * manually instead.
 */
export async function autoAssignProgramTeamVehicles(req: Request, res: Response): Promise<void> {
  const data = programTeamProgramIdSchema.parse(req.body);
  const tenantId = requireTenantId(req);

  const program = await loadProgramOrThrow(data.programId, tenantId);

  const teams = await prisma.programTeam.findMany({
    where: { programId: program.id },
    include: { members: { select: { id: true } }, vehicles: { select: { id: true } } },
    orderBy: { createdAt: "asc" },
  });
  const teamsNeedingVehicle = teams.filter((t) => t.vehicles.length === 0 && t.members.length + (t.leaderId ? 1 : 0) > 0);

  let pool = await prisma.vehicle.findMany({
    where: { tenantId, active: true, capacityPerDay: { not: null }, teamAssignments: { none: {} } },
    select: { id: true, name: true, capacityPerDay: true },
  });

  const createdRows: { teamId: string; teamName: string; vehicleId: string; vehicleName: string }[] = [];
  let teamsShort = 0;

  for (const team of teamsNeedingVehicle) {
    const headcount = team.members.length + (team.leaderId ? 1 : 0);
    if (pool.length === 0) {
      teamsShort += 1;
      continue;
    }

    const bySmallestSufficient = pool
      .filter((v) => (v.capacityPerDay as number) >= headcount)
      .sort((a, b) => (a.capacityPerDay as number) - (b.capacityPerDay as number));

    let taken: typeof pool = [];
    if (bySmallestSufficient.length > 0) {
      taken = [bySmallestSufficient[0]!];
    } else {
      let covered = 0;
      const byLargest = [...pool].sort((a, b) => (b.capacityPerDay as number) - (a.capacityPerDay as number));
      for (const v of byLargest) {
        if (covered >= headcount) break;
        taken.push(v);
        covered += v.capacityPerDay as number;
      }
      if (covered < headcount) teamsShort += 1;
    }

    for (const v of taken) {
      createdRows.push({ teamId: team.id, teamName: team.name, vehicleId: v.id, vehicleName: v.name });
    }
    const takenIds = new Set(taken.map((v) => v.id));
    pool = pool.filter((v) => !takenIds.has(v.id));
  }

  if (createdRows.length > 0) {
    await prisma.$transaction(createdRows.map((row) => prisma.programTeamVehicle.create({ data: { teamId: row.teamId, vehicleId: row.vehicleId } })));
  }

  const teamsAssigned = new Set(createdRows.map((r) => r.teamId)).size;

  await recordActivity({
    tenantId,
    userId: req.user!.sub,
    action: "auto-assigned vehicles for",
    entityType: "Program",
    entityId: program.id,
    metadata: { program: program.name, teamsAssigned, vehiclesUsed: createdRows.length, teamsShort },
  });

  const updatedTeams = await prisma.programTeam.findMany({ where: { programId: program.id }, include: teamInclude, orderBy: { createdAt: "asc" } });
  sendResponse(res, 200, `Assigned vehicles to ${teamsAssigned} of ${teamsNeedingVehicle.length} group(s) needing one`, {
    teamsAssigned,
    vehiclesUsed: createdRows.length,
    teamsShort,
    teams: updatedTeams,
  });
}

const eligibleRespondentSelect = {
  id: true,
  code: true,
  name: true,
  telephone: true,
  province: { select: { id: true, name: true } },
  district: { select: { id: true, name: true } },
  sector: { select: { id: true, name: true } },
  cell: { select: { id: true, name: true } },
} as const;

/**
 * Every ACTIVE, non-REPLACED respondent in the tenant not already on this
 * program is a candidate for enrollment — the actual selection (all of
 * them, a hand-picked list, or a random subset) is decided by the caller,
 * see `getEligibleRespondents` / `assignRespondentsToProgram` below.
 */
async function getEligibleRespondentPool(tenantId: string, programId: string) {
  return prisma.beneficiary.findMany({
    where: {
      tenantId,
      status: "ACTIVE",
      outcome: { not: "REPLACED" },
      programs: { none: { id: programId } },
    },
    select: eligibleRespondentSelect,
    orderBy: { name: "asc" },
  });
}

/**
 * GET /program-teams/eligible-respondents?programId= — active respondents
 * not yet enrolled on this program, for the "assign respondents" picker
 * (All / Specific list / Random number) ahead of running the assignment
 * engine.
 */
export async function getEligibleRespondents(req: Request, res: Response): Promise<void> {
  const tenantId = requireTenantId(req);
  const { programId } = req.query;
  if (typeof programId !== "string" || !programId) {
    throw new ApiError(400, "programId query parameter is required");
  }
  await loadProgramOrThrow(programId, tenantId);
  const respondents = await getEligibleRespondentPool(tenantId, programId);
  sendResponse(res, 200, "Eligible respondents retrieved successfully", { respondents });
}

/**
 * POST /program-teams/enroll-respondents — enrolls respondents onto a
 * program per the chosen mode: every eligible respondent, a hand-picked
 * list of them, or a random subset (count must be <= the eligible pool).
 * This is the one place respondents get enrolled onto a program; the
 * geo-assignment engine (`runProgramAssignment`) only ever works with
 * whoever is already enrolled — it no longer auto-enrolls everyone itself.
 */
export async function assignRespondentsToProgram(req: Request, res: Response): Promise<void> {
  const data = assignRespondentsToProgramSchema.parse(req.body);
  const tenantId = requireTenantId(req);
  const program = await loadProgramOrThrow(data.programId, tenantId);
  const pool = await getEligibleRespondentPool(tenantId, program.id);

  let selectedIds: string[];
  if (data.mode === "ALL") {
    selectedIds = pool.map((b) => b.id);
  } else if (data.mode === "SPECIFIC") {
    const poolIds = new Set(pool.map((b) => b.id));
    selectedIds = (data.beneficiaryIds ?? []).filter((id) => poolIds.has(id));
    if (selectedIds.length === 0) throw new ApiError(422, "Select at least one eligible respondent");
  } else {
    if (!data.count) throw new ApiError(422, "Provide the number of respondents to assign");
    if (data.count > pool.length) {
      throw new ApiError(422, `Only ${pool.length} active respondent(s) available — choose ${pool.length} or fewer`);
    }
    selectedIds = shuffle(pool.map((b) => b.id)).slice(0, data.count);
  }

  if (selectedIds.length > 0) {
    await prisma.program.update({
      where: { id: program.id },
      data: { beneficiaries: { connect: selectedIds.map((id) => ({ id })) } },
    });
  }

  await recordActivity({
    tenantId,
    userId: req.user!.sub,
    action: "assigned respondents to",
    entityType: "Program",
    entityId: program.id,
    metadata: { program: program.name, mode: data.mode, assignedCount: selectedIds.length },
  });

  sendResponse(res, 200, "Respondents assigned to program", { assignedCount: selectedIds.length, poolSize: pool.length });
}

/**
 * Phase 1 of the engine: hand every ACTIVE, program-enrolled respondent
 * without a live caseworker to an enumerator. Prefers the tightest
 * geographic match (cell → sector → district → province) among the
 * enumerator pool, but geography is a preference, not a gate — if nobody
 * shares any tier, every enumerator is still a valid candidate. Within
 * whichever tier wins, the enumerator with the fewest respondents *already
 * carrying in this program* is chosen, so re-running this repeatedly keeps
 * the split even instead of always favoring whoever matched first.
 */
async function assignRespondentsToEnumerators(
  tenantId: string,
  programId: string,
  enumerators: GeoUser[]
): Promise<{ assignedCount: number; eligibleCount: number; touchedUserIds: Set<string> }> {
  const eligible = await prisma.beneficiary.findMany({
    where: {
      tenantId,
      programs: { some: { id: programId } },
      status: "ACTIVE",
      outcome: { not: "REPLACED" },
      assignments: { none: { status: "ACTIVE" } },
    },
    select: { id: true, provinceId: true, districtId: true, sectorId: true, cellId: true },
  });
  if (eligible.length === 0) return { assignedCount: 0, eligibleCount: 0, touchedUserIds: new Set() };

  const currentActive = await prisma.beneficiaryAssignment.findMany({
    where: {
      tenantId,
      status: "ACTIVE",
      userId: { in: enumerators.map((e) => e.id) },
      beneficiary: { programs: { some: { id: programId } } },
    },
    select: { userId: true },
  });
  const counts = new Map<string, number>(enumerators.map((e) => [e.id, 0]));
  for (const a of currentActive) counts.set(a.userId, (counts.get(a.userId) ?? 0) + 1);

  const createdRows: { beneficiaryId: string; userId: string }[] = [];
  const touchedUserIds = new Set<string>();

  for (const beneficiary of shuffle(eligible)) {
    const candidates = bestGeoMatches(loc(beneficiary), enumerators);
    const minCount = Math.min(...candidates.map((c) => counts.get(c.id)!));
    const chosen = shuffle(candidates.filter((c) => counts.get(c.id) === minCount))[0]!;
    createdRows.push({ beneficiaryId: beneficiary.id, userId: chosen.id });
    counts.set(chosen.id, (counts.get(chosen.id) ?? 0) + 1);
    touchedUserIds.add(chosen.id);
  }

  await prisma.$transaction(
    createdRows.map((row) => prisma.beneficiaryAssignment.create({ data: { beneficiaryId: row.beneficiaryId, userId: row.userId, tenantId } }))
  );

  return { assignedCount: createdRows.length, eligibleCount: eligible.length, touchedUserIds };
}

/**
 * Phase 2 of the engine: grows ProgramTeam rows to
 * ceil(activeEnumeratorCount / membersPerTeam) — never shrinks
 * automatically, an under-headcount program just leaves teams under-filled
 * — then places every enumerator not yet on a team. Processes cell, then
 * sector, then district, then province: at each tier it groups the
 * still-unplaced pool by that field and, for each group, prefers a team
 * that already has someone sharing that same value before falling back to
 * any team with spare capacity. Whatever never shares any tier with an
 * existing team lands wherever there's room in a final pass.
 */
async function reconcileAndClusterTeams(
  tenantId: string,
  programId: string,
  membersPerTeam: number,
  enumerators: GeoUser[]
): Promise<{ teamsCreated: number; membersPlaced: number; newMemberUserIds: string[] }> {
  const existingTeams = await prisma.programTeam.findMany({
    where: { programId },
    include: { members: { include: { user: { select: geoUserSelect } } } },
    orderBy: { createdAt: "asc" },
  });

  const desiredTeamCount = Math.ceil(enumerators.length / membersPerTeam);
  const toCreateCount = Math.max(0, desiredTeamCount - existingTeams.length);
  if (toCreateCount > 0) {
    await prisma.$transaction(
      Array.from({ length: toCreateCount }, (_, i) =>
        prisma.programTeam.create({ data: { programId, tenantId, name: `Team ${existingTeams.length + i + 1}` } })
      )
    );
  }

  const teams = await prisma.programTeam.findMany({
    where: { programId },
    include: { members: { include: { user: { select: geoUserSelect } } } },
    orderBy: { createdAt: "asc" },
  });

  const placedIds = new Set([
    ...teams.flatMap((t) => t.members.map((m) => m.userId)),
    ...teams.map((t) => t.leaderId).filter((id): id is string => !!id),
  ]);
  let unplaced = enumerators.filter((e) => !placedIds.has(e.id));

  const capacity = new Map(teams.map((t) => [t.id, membersPerTeam - t.members.length]));
  const teamTierValues = new Map<string, Record<TierKey, Set<number>>>(
    teams.map((t) => [
      t.id,
      {
        cellId: new Set(t.members.map((m) => m.user.cellId).filter((v): v is number => v != null)),
        sectorId: new Set(t.members.map((m) => m.user.sectorId).filter((v): v is number => v != null)),
        districtId: new Set(t.members.map((m) => m.user.districtId).filter((v): v is number => v != null)),
        provinceId: new Set(t.members.map((m) => m.user.provinceId).filter((v): v is number => v != null)),
      },
    ])
  );

  const createdMemberships: { teamId: string; userId: string }[] = [];

  function place(user: GeoUser, team: (typeof teams)[number]): void {
    createdMemberships.push({ teamId: team.id, userId: user.id });
    capacity.set(team.id, (capacity.get(team.id) ?? 0) - 1);
    const tiers = teamTierValues.get(team.id)!;
    for (const key of TIER_KEYS) {
      const v = user[key];
      if (v != null) tiers[key].add(v);
    }
  }

  function anyTeamWithCapacity(): (typeof teams)[number] | undefined {
    return teams.find((t) => (capacity.get(t.id) ?? 0) > 0);
  }

  for (const tierKey of TIER_KEYS) {
    const groups = new Map<number, GeoUser[]>();
    const noValue: GeoUser[] = [];
    for (const e of unplaced) {
      const v = e[tierKey];
      if (v == null) {
        noValue.push(e);
        continue;
      }
      const arr = groups.get(v);
      if (arr) arr.push(e);
      else groups.set(v, [e]);
    }

    const stillUnplaced: GeoUser[] = [...noValue];
    for (const [value, group] of shuffle(Array.from(groups.entries()))) {
      for (const e of shuffle(group)) {
        const preferred = teams.find((t) => (capacity.get(t.id) ?? 0) > 0 && teamTierValues.get(t.id)![tierKey].has(value));
        const target = preferred ?? anyTeamWithCapacity();
        if (!target) {
          stillUnplaced.push(e);
          continue;
        }
        place(e, target);
      }
    }
    unplaced = stillUnplaced;
  }

  // Safety net — by construction capacity always covers everyone, but never
  // silently drop someone if geography left them unplaced.
  for (const e of shuffle(unplaced)) {
    const target = anyTeamWithCapacity();
    if (target) place(e, target);
  }

  if (createdMemberships.length > 0) {
    await prisma.$transaction(
      createdMemberships.map((row) => prisma.programTeamMember.create({ data: { teamId: row.teamId, programId, userId: row.userId } }))
    );
  }

  return { teamsCreated: toCreateCount, membersPlaced: createdMemberships.length, newMemberUserIds: createdMemberships.map((r) => r.userId) };
}

/**
 * Phase 3 of the engine: for every team still missing a leader, picks the
 * available supervisor whose location best matches that team's members
 * (majority cell, falling back to sector/district/province), preferring
 * geography but never blocking on it. Once a run's pool of supervisors is
 * spent, remaining leaderless teams simply stay that way — "No supervisor
 * assigned" — and the *next* run (e.g. once a new supervisor registers)
 * fills exactly those first, since it only ever looks at teams still
 * missing a leader.
 */
async function assignSupervisors(
  tenantId: string,
  programId: string,
  supervisors: GeoUser[]
): Promise<{ assignedCount: number; newLeaderUserIds: { userId: string; teamId: string; teamName: string }[] }> {
  if (supervisors.length === 0) return { assignedCount: 0, newLeaderUserIds: [] };

  const teams = await prisma.programTeam.findMany({
    where: { programId },
    include: { members: { include: { user: { select: geoUserSelect } } } },
    orderBy: { createdAt: "asc" },
  });
  const teamsNeedingLeader = teams.filter((t) => !t.leaderId);
  if (teamsNeedingLeader.length === 0) return { assignedCount: 0, newLeaderUserIds: [] };

  const takenIds = new Set([
    ...teams.flatMap((t) => t.members.map((m) => m.userId)),
    ...teams.map((t) => t.leaderId).filter((id): id is string => !!id),
  ]);
  let available = supervisors.filter((s) => !takenIds.has(s.id));

  const assignments: { teamId: string; teamName: string; leader: GeoUser }[] = [];
  for (const team of teamsNeedingLeader) {
    if (available.length === 0) break;
    const repLoc = teamRepresentativeLocation(team.members.map((m) => m.user));
    const candidates = bestGeoMatches(repLoc, available);
    const chosen = shuffle(candidates)[0]!;
    assignments.push({ teamId: team.id, teamName: team.name, leader: chosen });
    available = available.filter((s) => s.id !== chosen.id);
  }

  if (assignments.length > 0) {
    await prisma.$transaction(assignments.map((a) => prisma.programTeam.update({ where: { id: a.teamId }, data: { leaderId: a.leader.id } })));
  }

  return {
    assignedCount: assignments.length,
    newLeaderUserIds: assignments.map((a) => ({ userId: a.leader.id, teamId: a.teamId, teamName: a.teamName })),
  };
}

/**
 * The whole geo-aware assignment engine, run per-program with one click:
 * pull every active enumerator/supervisor onto the program, hand every
 * active unassigned respondent to an enumerator, grow/cluster teams by
 * geography, then fill any leaderless team with the best-matching available
 * supervisor. Every phase only ever touches *unplaced* entities, so calling
 * this again later (after new staff register, or new respondents enroll)
 * is exactly "reassign / top up" — nothing already placed is disturbed.
 */
export async function runProgramAssignment(req: Request, res: Response): Promise<void> {
  const data = programTeamProgramIdSchema.parse(req.body);
  const tenantId = requireTenantId(req);

  const program = await loadProgramOrThrow(data.programId, tenantId);
  if (!program.teamLeaderRoleId || !program.teamMemberRoleId) {
    throw new ApiError(422, "Configure the team leader and team member roles for this program first");
  }
  if (!program.membersPerTeam) {
    throw new ApiError(422, "Configure the enumerators-per-group target for this program first");
  }
  if (program.tracingRequired) {
    const pending = await countPendingTracing(tenantId, program.id);
    if (pending > 0) {
      throw new ApiError(
        422,
        `Tracing is required for this program and is not complete — ${pending} respondent(s) still pending`,
      );
    }
  }

  const [enumerators, supervisors] = await Promise.all([
    prisma.user.findMany({ where: { tenantId, roleId: program.teamMemberRoleId, status: "ACTIVE" }, select: geoUserSelect }),
    prisma.user.findMany({ where: { tenantId, roleId: program.teamLeaderRoleId, status: "ACTIVE" }, select: geoUserSelect }),
  ]);
  if (enumerators.length === 0) {
    throw new ApiError(422, "No active users hold the configured team member (enumerator) role yet");
  }

  const newlyOnProgram = new Set<string>();
  for (const u of [...enumerators, ...supervisors]) {
    if (await ensureProgramAssignment(tenantId, u.id, program.id)) newlyOnProgram.add(u.id);
  }

  const respondentResult = await assignRespondentsToEnumerators(tenantId, program.id, enumerators);
  const teamResult = await reconcileAndClusterTeams(tenantId, program.id, program.membersPerTeam, enumerators);
  const supervisorResult = await assignSupervisors(tenantId, program.id, supervisors);

  await recordActivity({
    tenantId,
    userId: req.user!.sub,
    action: "ran the geo-assignment engine for",
    entityType: "Program",
    entityId: program.id,
    metadata: {
      program: program.name,
      activeEnumerators: enumerators.length,
      activeSupervisors: supervisors.length,
      respondentsAssigned: respondentResult.assignedCount,
      teamsCreated: teamResult.teamsCreated,
      membersPlaced: teamResult.membersPlaced,
      supervisorsAssigned: supervisorResult.assignedCount,
    },
  });

  const notifications: Promise<unknown>[] = [];
  for (const userId of newlyOnProgram) {
    notifications.push(
      notifyUser({
        tenantId,
        userId,
        type: "ASSIGNMENT_PROGRAM",
        message: `You've been assigned to the program "${program.name}"`,
        entityType: "Program",
        entityId: program.id,
      })
    );
  }
  for (const userId of respondentResult.touchedUserIds) {
    notifications.push(
      notifyUser({
        tenantId,
        userId,
        type: "ASSIGNMENT_BENEFICIARY",
        message: `You've been assigned new respondent(s) for "${program.name}"`,
        entityType: "Program",
        entityId: program.id,
      })
    );
  }
  for (const { userId, teamName } of supervisorResult.newLeaderUserIds) {
    notifications.push(
      notifyUser({
        tenantId,
        userId,
        type: "ASSIGNMENT_PROGRAM",
        message: `You've been assigned as leader of "${teamName}" for "${program.name}"`,
        entityType: "Program",
        entityId: program.id,
      })
    );
  }
  await Promise.all(notifications);

  const teams = await prisma.programTeam.findMany({ where: { programId: program.id }, include: teamInclude, orderBy: { createdAt: "asc" } });

  sendResponse(res, 200, "Program assignment engine ran successfully", {
    activeEnumerators: enumerators.length,
    activeSupervisors: supervisors.length,
    respondentsAssigned: respondentResult.assignedCount,
    respondentsEligible: respondentResult.eligibleCount,
    teamsCreated: teamResult.teamsCreated,
    membersPlaced: teamResult.membersPlaced,
    supervisorsAssigned: supervisorResult.assignedCount,
    teamsMissingSupervisor: teams.filter((t) => !t.leaderId).length,
    teams,
  });
}

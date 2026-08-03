import type { Request, Response } from "express";
import { requireTenantId } from "../middleware/auth.js";
import { ApiError } from "../middleware/errorHandler.js";
import { sendResponse } from "../utils/apiResponse.js";
import { prisma } from "../utils/prisma.js";
import { autoAssignBeneficiariesSchema, createBeneficiaryAssignmentSchema } from "../utils/validators.js";
import { recordActivity } from "../utils/activityLog.js";
import { notifyUser } from "../utils/notifications.js";
import { clusterByGeography } from "../utils/geo.js";

const assignmentInclude = {
  user: { select: { id: true, name: true, email: true } },
  beneficiary: { select: { id: true, code: true, name: true } },
  vehicle: { select: { id: true, name: true, type: true, driverName: true } },
} as const;

function idParam(req: Request): string {
  return req.params.id as string;
}

/**
 * Round-robins `items` across `userIds`, capping each user at `cap` (pass
 * Infinity for no cap). Shared by both the plain enumerator-only path and
 * each vehicle's own sub-batch, so "assign evenly, respect a daily cap,
 * never silently drop the remainder" is exactly one implementation.
 */
function roundRobinAssign<T>(
  items: T[],
  userIds: string[],
  cap: number
): { buckets: Map<string, T[]>; assignedCount: number } {
  const buckets = new Map<string, T[]>(userIds.map((id) => [id, [] as T[]]));
  let userIndex = 0;
  let assignedCount = 0;
  for (const item of items) {
    let attempts = 0;
    while (attempts < userIds.length && (buckets.get(userIds[userIndex % userIds.length])?.length ?? 0) >= cap) {
      userIndex++;
      attempts++;
    }
    if (attempts >= userIds.length) break; // everyone is at capacity — remainder is leftover
    const uid = userIds[userIndex % userIds.length];
    buckets.get(uid)!.push(item);
    userIndex++;
    assignedCount++;
  }
  return { buckets, assignedCount };
}

export async function listBeneficiaryAssignments(req: Request, res: Response): Promise<void> {
  const tenantId = requireTenantId(req);
  const { userId, beneficiaryId, status } = req.query;

  const assignments = await prisma.beneficiaryAssignment.findMany({
    where: {
      tenantId,
      ...(typeof userId === "string" ? { userId } : {}),
      ...(typeof beneficiaryId === "string" ? { beneficiaryId } : {}),
      ...(status === "ACTIVE" || status === "ENDED" ? { status } : {}),
    },
    include: assignmentInclude,
    orderBy: { assignedAt: "desc" },
  });

  sendResponse(res, 200, "Beneficiary assignments retrieved successfully", assignments);
}

export async function createBeneficiaryAssignment(req: Request, res: Response): Promise<void> {
  const data = createBeneficiaryAssignmentSchema.parse(req.body);
  const tenantId = requireTenantId(req);

  const [beneficiary, user] = await Promise.all([
    prisma.beneficiary.findFirst({ where: { id: data.beneficiaryId, tenantId } }),
    prisma.user.findFirst({ where: { id: data.userId, tenantId } }),
  ]);
  if (!beneficiary) throw new ApiError(400, "beneficiaryId does not belong to your tenant");
  if (!user) throw new ApiError(400, "userId does not belong to your tenant");

  const existing = await prisma.beneficiaryAssignment.findFirst({
    where: { beneficiaryId: data.beneficiaryId, userId: data.userId, status: "ACTIVE" },
  });
  if (existing) throw new ApiError(409, "This beneficiary is already actively assigned to this user");

  const assignment = await prisma.beneficiaryAssignment.create({
    data: { ...data, tenantId },
    include: assignmentInclude,
  });

  await recordActivity({
    tenantId,
    userId: req.user!.sub,
    action: "assigned",
    entityType: "BeneficiaryAssignment",
    entityId: assignment.id,
    metadata: { user: assignment.user.name ?? assignment.user.email, beneficiary: assignment.beneficiary.name },
  });

  await notifyUser({
    tenantId,
    userId: assignment.userId,
    type: "ASSIGNMENT_BENEFICIARY",
    message: `You've been assigned as caseworker for ${assignment.beneficiary.name} (${assignment.beneficiary.code})`,
    entityType: "Beneficiary",
    entityId: assignment.beneficiaryId,
  });

  sendResponse(res, 201, "Beneficiary assignment created successfully", assignment);
}

export async function endBeneficiaryAssignment(req: Request, res: Response): Promise<void> {
  const existing = await prisma.beneficiaryAssignment.findFirst({
    where: { id: idParam(req), tenantId: requireTenantId(req) },
  });
  if (!existing) throw new ApiError(404, "Beneficiary assignment not found");

  const assignment = await prisma.beneficiaryAssignment.update({
    where: { id: existing.id },
    data: { status: "ENDED", endedAt: new Date() },
    include: assignmentInclude,
  });

  sendResponse(res, 200, "Beneficiary assignment ended successfully", assignment);
}

export async function deleteBeneficiaryAssignment(req: Request, res: Response): Promise<void> {
  const existing = await prisma.beneficiaryAssignment.findFirst({
    where: { id: idParam(req), tenantId: requireTenantId(req) },
  });
  if (!existing) throw new ApiError(404, "Beneficiary assignment not found");

  await prisma.beneficiaryAssignment.delete({ where: { id: existing.id } });
  sendResponse(res, 200, "Beneficiary assignment deleted successfully", null);
}

/**
 * The generic Smart Assignment Engine. Vehicles/drivers/motorcycles are
 * entirely OPTIONAL logistics layered on top — per the field-ops PRD, "the
 * vehicle is just in case, but where there isn't [one]... the vehicle
 * should be optional, not a requirement." The core engine only needs a
 * program, a pool of enumerators, and a strategy:
 *
 *  - EVEN: split the candidate pool as equally as possible across enumerators.
 *  - DAILY_TARGET: cap each enumerator at `dailyTarget`; leftovers are
 *    returned unassigned for the next run/day, never silently dropped.
 *  - RANDOM: same shuffle, but everyone gets from the same pool with no
 *    even-split guarantee (useful for ad-hoc top-ups).
 *
 * Beneficiaries are clustered by geography before shuffling (province →
 * district → sector → cell → village) so nearby respondents tend to land
 * with the same enumerator, without ever hand-picking who goes to whom.
 *
 * If `vehicles` is provided, the pool is sliced across them first — each
 * vehicle takes up to its own daily capacity, then round-robins that slice
 * across the enumerators riding it — exactly the "50 beneficiaries, vehicle
 * takes 20, 30 left to assign elsewhere" scenario from the PRD.
 */
export async function autoAssignBeneficiaries(req: Request, res: Response): Promise<void> {
  const data = autoAssignBeneficiariesSchema.parse(req.body);
  const tenantId = requireTenantId(req);

  const [program, users] = await Promise.all([
    prisma.program.findFirst({ where: { id: data.programId, tenantId } }),
    prisma.user.findMany({ where: { id: { in: data.userIds }, tenantId }, select: { id: true, name: true, email: true } }),
  ]);
  if (!program) throw new ApiError(400, "programId does not belong to your tenant");
  if (users.length !== data.userIds.length) throw new ApiError(400, "One or more userIds do not belong to your tenant");
  const userIdSet = new Set(data.userIds);

  let vehicles: { id: string; name: string; capacityPerDay: number | null }[] = [];
  if (data.vehicles && data.vehicles.length > 0) {
    vehicles = await prisma.vehicle.findMany({
      where: { id: { in: data.vehicles.map((v) => v.vehicleId) }, tenantId },
      select: { id: true, name: true, capacityPerDay: true },
    });
    if (vehicles.length !== data.vehicles.length) {
      throw new ApiError(400, "One or more vehicleIds do not belong to your tenant");
    }
    for (const v of data.vehicles) {
      for (const uid of v.userIds) {
        if (!userIdSet.has(uid)) {
          throw new ApiError(400, "Every user assigned to a vehicle must also be part of the selected enumerator pool");
        }
      }
    }
  }

  const candidates = await prisma.beneficiary.findMany({
    where: {
      tenantId,
      programs: { some: { id: data.programId } },
      ...(data.province ? { province: data.province } : {}),
      ...(data.district ? { district: data.district } : {}),
      ...(data.sector ? { sector: data.sector } : {}),
      ...(data.onlyUnassigned
        ? { assignments: { none: { status: "ACTIVE" } } }
        : {}),
    },
    select: {
      id: true,
      code: true,
      name: true,
      province: true,
      district: true,
      sector: true,
      cell: true,
      village: true,
    },
  });

  if (candidates.length === 0) {
    sendResponse(res, 200, "No eligible respondents to assign — everyone in scope already has an active assignment.", {
      totalCandidates: 0,
      totalAssigned: 0,
      perUser: users.map((u) => ({ userId: u.id, name: u.name ?? u.email, count: 0 })),
      perVehicle: [],
      leftover: 0,
    });
    return;
  }

  const ordered = clusterByGeography(candidates);
  const cap = data.strategy === "DAILY_TARGET" && data.dailyTarget ? data.dailyTarget : Infinity;

  const createdRows: { userId: string; beneficiaryId: string; vehicleId?: string }[] = [];
  const perUserCounts = new Map<string, number>(data.userIds.map((id) => [id, 0]));
  const perVehicle: { vehicleId: string; name: string; count: number }[] = [];
  let assignedCount = 0;

  if (vehicles.length > 0 && data.vehicles) {
    // Distribute across vehicles in the order given — each takes up to its
    // own capacity from the front of the (already geo-clustered) pool, then
    // round-robins that slice across just its own enumerators.
    let cursor = 0;
    for (const alloc of data.vehicles) {
      const vehicle = vehicles.find((v) => v.id === alloc.vehicleId)!;
      const capacity = vehicle.capacityPerDay ?? Infinity;
      const remainingPool = ordered.slice(cursor);
      const slice = remainingPool.slice(0, capacity === Infinity ? remainingPool.length : capacity);
      cursor += slice.length;

      const { buckets, assignedCount: vehicleAssigned } = roundRobinAssign(slice, alloc.userIds, cap);
      for (const [userId, list] of buckets) {
        for (const b of list) createdRows.push({ userId, beneficiaryId: b.id, vehicleId: vehicle.id });
        perUserCounts.set(userId, (perUserCounts.get(userId) ?? 0) + list.length);
      }
      perVehicle.push({ vehicleId: vehicle.id, name: vehicle.name, count: vehicleAssigned });
      assignedCount += vehicleAssigned;
      if (cursor >= ordered.length) break;
    }
  } else {
    const { buckets, assignedCount: total } = roundRobinAssign(ordered, data.userIds, cap);
    for (const [userId, list] of buckets) {
      for (const b of list) createdRows.push({ userId, beneficiaryId: b.id });
      perUserCounts.set(userId, list.length);
    }
    assignedCount = total;
  }

  const leftover = ordered.length - assignedCount;

  await prisma.$transaction(
    createdRows.map((row) =>
      prisma.beneficiaryAssignment.create({
        data: {
          userId: row.userId,
          beneficiaryId: row.beneficiaryId,
          tenantId,
          transportMode: data.transportMode === "NONE" ? null : data.transportMode,
          vehicleId: row.vehicleId,
        },
      })
    )
  );

  const perUser = users.map((u) => ({ userId: u.id, name: u.name ?? u.email, count: perUserCounts.get(u.id) ?? 0 }));

  await recordActivity({
    tenantId,
    userId: req.user!.sub,
    action: "auto-assigned",
    entityType: "BeneficiaryAssignment",
    entityId: program.id,
    metadata: {
      program: program.name,
      strategy: data.strategy,
      transportMode: data.transportMode,
      assignedCount,
      leftover,
      perUser,
      perVehicle,
    },
  });

  await Promise.all(
    perUser
      .filter((u) => u.count > 0)
      .map((u) =>
        notifyUser({
          tenantId,
          userId: u.userId,
          type: "ASSIGNMENT_BENEFICIARY",
          message: `You've been assigned ${u.count} new respondent(s) for "${program.name}"`,
          entityType: "Program",
          entityId: program.id,
        })
      )
  );

  sendResponse(res, 201, `Assigned ${assignedCount} of ${ordered.length} eligible respondents`, {
    totalCandidates: ordered.length,
    totalAssigned: assignedCount,
    perUser,
    perVehicle,
    leftover,
  });
}

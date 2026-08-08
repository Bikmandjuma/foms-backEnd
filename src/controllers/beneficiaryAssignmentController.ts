import type { Request, Response } from "express";
import { requireTenantId } from "../middleware/auth.js";
import { ApiError } from "../middleware/errorHandler.js";
import { sendResponse } from "../utils/apiResponse.js";
import { prisma } from "../utils/prisma.js";
import { autoAssignBeneficiariesSchema, createBeneficiaryAssignmentSchema } from "../utils/validators.js";
import { recordActivity } from "../utils/activityLog.js";
import { notifyUser } from "../utils/notifications.js";
import { shuffle } from "../utils/geo.js";

const assignmentInclude = {
  user: { select: { id: true, name: true, email: true } },
  beneficiary: { select: { id: true, code: true, name: true } },
  vehicle: { select: { id: true, name: true, type: true, driverName: true } },
} as const;

function idParam(req: Request): string {
  return req.params.id as string;
}

/**
 * Round-robins `items` across `userIds` with no cap — every enumerator
 * assigned to the program gets an even share of whatever that vehicle
 * picked up. Shared by every vehicle's own slice, so "distribute evenly
 * across whoever's driving this trip" is exactly one implementation.
 */
function roundRobinAssign<T>(items: T[], userIds: string[]): Map<string, T[]> {
  const buckets = new Map<string, T[]>(userIds.map((id) => [id, [] as T[]]));
  items.forEach((item, i) => {
    const uid = userIds[i % userIds.length]!;
    buckets.get(uid)!.push(item);
  });
  return buckets;
}

export async function listBeneficiaryAssignments(req: Request, res: Response): Promise<void> {
  const tenantId = requireTenantId(req);
  const { userId, beneficiaryId, status, vehicleId, programId } = req.query;

  const assignments = await prisma.beneficiaryAssignment.findMany({
    where: {
      tenantId,
      ...(typeof userId === "string" ? { userId } : {}),
      ...(typeof beneficiaryId === "string" ? { beneficiaryId } : {}),
      ...(typeof vehicleId === "string" ? { vehicleId } : {}),
      ...(typeof programId === "string" ? { beneficiary: { programs: { some: { id: programId } } } } : {}),
      ...(status === "ACTIVE" || status === "ENDED" ? { status } : {}),
    },
    include: assignmentInclude,
    orderBy: { assignedAt: "desc" },
  });

  sendResponse(res, 200, "Beneficiary assignments retrieved successfully", assignments);
}

// Kept for the rare one-off correction — the assignment engine below is the
// primary path now, this is no longer exposed as a general "manual
// assignment" flow in the UI.
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
 * The Smart Assignment Engine — "Random Top-Up". Input is deliberately
 * minimal: a program and one or more vehicles.
 *
 *  1. Enumerators are auto-detected from ProgramAssignment for this
 *     program — never picked manually here. If none exist, the caller
 *     should have already shown "assign an enumerator first" (see
 *     GET /program-assignments?programId=X&status=ACTIVE), but this is
 *     re-checked server-side too.
 *  2. Eligible respondents (enrolled in the program, not already REPLACED,
 *     with no active caseworker) are shuffled — genuinely random, no
 *     duplicates possible since each is drawn once from a shared pool.
 *  3. Vehicles are filled in the order given, each up to its own daily
 *     capacity; whatever's left over after every vehicle is full carries
 *     over to the NEXT run (the same vehicle can "return for another
 *     trip" by simply running this again later) rather than being dropped.
 *  4. Within each vehicle's slice, respondents are round-robin'd evenly
 *     across the program's enumerators.
 */
export async function autoAssignBeneficiaries(req: Request, res: Response): Promise<void> {
  const data = autoAssignBeneficiariesSchema.parse(req.body);
  const tenantId = requireTenantId(req);

  const program = await prisma.program.findFirst({ where: { id: data.programId, tenantId } });
  if (!program) throw new ApiError(400, "programId does not belong to your tenant");

  const enumeratorAssignments = await prisma.programAssignment.findMany({
    where: { programId: data.programId, tenantId, status: "ACTIVE" },
    select: { user: { select: { id: true, name: true, email: true } } },
  });
  if (enumeratorAssignments.length === 0) {
    throw new ApiError(422, "This program has not yet been assigned to an Enumerator.");
  }
  const enumerators = enumeratorAssignments.map((a) => a.user);
  const enumeratorIds = enumerators.map((e) => e.id);

  const vehicles = await prisma.vehicle.findMany({
    where: { id: { in: data.vehicleIds }, tenantId },
    select: { id: true, name: true, type: true, driverName: true, capacityPerDay: true },
  });
  if (vehicles.length !== data.vehicleIds.length) {
    throw new ApiError(400, "One or more vehicleIds do not belong to your tenant");
  }
  // Preserve the order the caller selected them in — "Car 1" is whichever
  // vehicle they picked first, not a database ordering.
  const orderedVehicles = data.vehicleIds.map((id) => vehicles.find((v) => v.id === id)!);

  const candidates = await prisma.beneficiary.findMany({
    where: {
      tenantId,
      programs: { some: { id: data.programId } },
      outcome: { not: "REPLACED" },
      assignments: { none: { status: "ACTIVE" } },
    },
    select: { id: true, code: true, name: true },
  });

  const pool = shuffle(candidates);
  const totalCandidates = pool.length;

  const createdRows: { userId: string; beneficiaryId: string; vehicleId: string; transportMode: "VEHICLE" | "MOTORCYCLE" }[] = [];
  const vehicleResults: {
    vehicleId: string;
    name: string;
    type: string;
    driverName: string | null;
    capacityPerDay: number | null;
    assigned: { id: string; code: string; name: string; userId: string; userName: string }[];
  }[] = [];

  let cursor = 0;
  for (const vehicle of orderedVehicles) {
    if (cursor >= pool.length) {
      vehicleResults.push({ vehicleId: vehicle.id, name: vehicle.name, type: vehicle.type, driverName: vehicle.driverName, capacityPerDay: vehicle.capacityPerDay, assigned: [] });
      continue;
    }
    const capacity = vehicle.capacityPerDay ?? pool.length;
    const slice = pool.slice(cursor, cursor + capacity);
    cursor += slice.length;

    const buckets = roundRobinAssign(slice, enumeratorIds);
    const assigned: (typeof vehicleResults)[number]["assigned"] = [];
    for (const [userId, items] of buckets) {
      const enumerator = enumerators.find((e) => e.id === userId)!;
      for (const b of items) {
        createdRows.push({ userId, beneficiaryId: b.id, vehicleId: vehicle.id, transportMode: vehicle.type });
        assigned.push({ id: b.id, code: b.code, name: b.name, userId, userName: enumerator.name ?? enumerator.email });
      }
    }
    vehicleResults.push({ vehicleId: vehicle.id, name: vehicle.name, type: vehicle.type, driverName: vehicle.driverName, capacityPerDay: vehicle.capacityPerDay, assigned });
  }

  const leftover = pool.length - cursor;

  if (createdRows.length > 0) {
    await prisma.$transaction(
      createdRows.map((row) =>
        prisma.beneficiaryAssignment.create({
          data: {
            userId: row.userId,
            beneficiaryId: row.beneficiaryId,
            tenantId,
            vehicleId: row.vehicleId,
            transportMode: row.transportMode,
          },
        })
      )
    );
  }

  await recordActivity({
    tenantId,
    userId: req.user!.sub,
    action: "ran assignment engine",
    entityType: "Program",
    entityId: program.id,
    metadata: { program: program.name, totalAssigned: createdRows.length, leftover, vehicles: orderedVehicles.map((v) => v.name) },
  });

  await Promise.all(
    enumerators
      .filter((e) => vehicleResults.some((v) => v.assigned.some((a) => a.userId === e.id)))
      .map((e) => {
        const count = vehicleResults.reduce((n, v) => n + v.assigned.filter((a) => a.userId === e.id).length, 0);
        return notifyUser({
          tenantId,
          userId: e.id,
          type: "ASSIGNMENT_BENEFICIARY",
          message: `You've been assigned ${count} new respondent(s) for "${program.name}"`,
          entityType: "Program",
          entityId: program.id,
        });
      })
  );

  sendResponse(res, 201, `Assigned ${createdRows.length} of ${totalCandidates} eligible respondents`, {
    program: { id: program.id, name: program.name },
    enumerators: enumerators.map((e) => ({ id: e.id, name: e.name ?? e.email })),
    vehicles: vehicleResults,
    totalCandidates,
    totalAssigned: createdRows.length,
    leftover,
  });
}

/**
 * Download Report — PDF/Excel/CSV export for a program's current
 * assignment run. ?programId= is required; ?vehicleId= optionally narrows
 * it to one vehicle's tab; ?format=xlsx|csv|pdf (defaults to xlsx).
 */
export async function exportAssignmentReport(req: Request, res: Response): Promise<void> {
  const tenantId = requireTenantId(req);
  const { programId, vehicleId, format } = req.query;
  if (typeof programId !== "string" || !programId) {
    throw new ApiError(400, "programId query parameter is required");
  }

  const program = await prisma.program.findFirst({ where: { id: programId, tenantId } });
  if (!program) throw new ApiError(404, "Program not found");

  const assignments = await prisma.beneficiaryAssignment.findMany({
    where: {
      tenantId,
      status: "ACTIVE",
      beneficiary: { programs: { some: { id: programId } } },
      ...(typeof vehicleId === "string" && vehicleId ? { vehicleId } : {}),
    },
    include: assignmentInclude,
    orderBy: [{ vehicleId: "asc" }, { assignedAt: "asc" }],
  });

  const { buildAssignmentReportWorkbook } = await import("../utils/excel.js");
  const rows = assignments.map((a) => ({
    vehicle: a.vehicle?.name ?? "—",
    driverName: a.vehicle?.driverName ?? "—",
    respondentCode: a.beneficiary.code,
    respondentName: a.beneficiary.name,
    enumerator: a.user.name ?? a.user.email,
    program: program.name,
  }));

  const filenameBase = `assignment-report-${program.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
  const fmt = typeof format === "string" ? format : "xlsx";

  if (fmt === "csv") {
    const header = "Vehicle,Driver,Respondent Code,Respondent Name,Enumerator,Program";
    const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const lines = rows.map((r) => [r.vehicle, r.driverName, r.respondentCode, r.respondentName, r.enumerator, r.program].map(escape).join(","));
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${filenameBase}.csv"`);
    res.send([header, ...lines].join("\n"));
    return;
  }

  if (fmt === "pdf") {
    const { buildAssignmentReportPdf } = await import("../utils/pdf.js");
    const buffer = await buildAssignmentReportPdf(rows, `Assignment report ${program.name}`);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filenameBase}.pdf"`);
    res.send(buffer);
    return;
  }

  const buffer = await buildAssignmentReportWorkbook(rows);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${filenameBase}.xlsx"`);
  res.send(buffer);
}

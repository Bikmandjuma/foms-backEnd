import type { Request, Response } from "express";
import { z } from "zod";
import { requireTenantId } from "../middleware/auth.js";
import { ApiError } from "../middleware/errorHandler.js";
import { sendResponse } from "../utils/apiResponse.js";
import { prisma } from "../utils/prisma.js";
import { recordActivity } from "../utils/activityLog.js";
import {
  addFieldNoteSchema,
  checkoutSchema,
  currentGpsSchema,
  recordFieldVisitSchema,
} from "../utils/validators.js";
import { buildDailyReportWorkbook, type DailyReportRow } from "../utils/excel.js";

const include = {
  user: { select: { id: true, name: true, email: true } },
  project: { select: { id: true, name: true } },
} as const;

const checkInSchema = z.object({
  projectId: z.string().uuid().optional(),
  gpsLat: z.number().optional(),
  gpsLng: z.number().optional(),
  note: z.string().optional(),
});

function idParam(req: Request): string {
  return req.params.id as string;
}

export async function listCheckIns(req: Request, res: Response): Promise<void> {
  const tenantId = requireTenantId(req);
  const { userId, projectId, active } = req.query;

  const checkIns = await prisma.fieldCheckIn.findMany({
    where: {
      tenantId,
      ...(typeof userId === "string" ? { userId } : {}),
      ...(typeof projectId === "string" ? { projectId } : {}),
      ...(active === "true" ? { checkOutAt: null } : {}),
    },
    include,
    orderBy: { checkInAt: "desc" },
  });
  sendResponse(res, 200, "Field check-ins retrieved successfully", checkIns);
}

export async function createCheckIn(req: Request, res: Response): Promise<void> {
  const data = checkInSchema.parse(req.body);
  const tenantId = requireTenantId(req);

  if (data.projectId) {
    const project = await prisma.program.findFirst({ where: { id: data.projectId, tenantId } });
    if (!project) throw new ApiError(400, "projectId does not belong to your tenant");
  }

  const checkIn = await prisma.fieldCheckIn.create({
    data: { ...data, tenantId, userId: req.user!.sub },
    include,
  });

  await recordActivity({
    tenantId,
    userId: req.user!.sub,
    action: "checked in",
    entityType: "FieldCheckIn",
    entityId: checkIn.id,
  });

  sendResponse(res, 201, "Checked in successfully", checkIn);
}

export async function endCheckIn(req: Request, res: Response): Promise<void> {
  const data = checkoutSchema.parse(req.body ?? {});
  const tenantId = requireTenantId(req);
  const existing = await prisma.fieldCheckIn.findFirst({ where: { id: idParam(req), tenantId } });
  if (!existing) throw new ApiError(404, "Check-in not found");
  if (existing.checkOutAt) throw new ApiError(409, "Already checked out");

  const isOwner = existing.userId === req.user!.sub;
  // PRD FR-8: "If not all respondents are processed... complete them before
  // checking out... or allow supervisors to override with a reason." A
  // supervisor (monitoring:manage) can check someone else out — but only
  // with a recorded reason, since it's not their own session to close.
  const canOverride = req.user!.isPlatformAdmin || (await hasMonitoringManage(req));

  if (!isOwner && !canOverride) {
    throw new ApiError(403, "You can only check yourself out — ask a supervisor to override otherwise");
  }
  if (!isOwner && !data.overrideReason) {
    throw new ApiError(400, "Checking someone else out requires a recorded reason");
  }

  if (existing.projectId) {
    const assignedCount = await prisma.beneficiaryAssignment.count({
      where: { userId: existing.userId, tenantId, status: "ACTIVE", beneficiary: { programs: { some: { id: existing.projectId } } } },
    });
    const visitedCount = await prisma.fieldVisit.count({ where: { checkInId: existing.id } });
    const remaining = Math.max(0, assignedCount - visitedCount);

    if (remaining > 0 && !data.overrideReason) {
      throw new ApiError(
        409,
        `You still have ${remaining} respondent(s) without a recorded outcome. Complete them before checking out, or ask a supervisor to override.`
      );
    }
    if (remaining > 0 && data.overrideReason && !canOverride) {
      throw new ApiError(403, "Only a supervisor can override an incomplete checkout");
    }
  }

  const checkIn = await prisma.fieldCheckIn.update({
    where: { id: existing.id },
    data: {
      checkOutAt: new Date(),
      checkoutOverrideReason: data.overrideReason || null,
    },
    include,
  });

  await recordActivity({
    tenantId,
    userId: req.user!.sub,
    action: data.overrideReason ? "checked out (overridden)" : "checked out",
    entityType: "FieldCheckIn",
    entityId: checkIn.id,
    metadata: data.overrideReason ? { overrideReason: data.overrideReason, onBehalfOf: existing.userId } : undefined,
  });

  sendResponse(res, 200, "Checked out successfully", checkIn);
}

async function hasMonitoringManage(req: Request): Promise<boolean> {
  if (req.user!.isPlatformAdmin) return true;
  if (!req.user!.roleId) return false;
  const role = await prisma.role.findUnique({ where: { id: req.user!.roleId }, select: { permissions: true } });
  return Array.isArray(role?.permissions) && (role!.permissions as string[]).includes("monitoring:manage");
}

/**
 * Today's assigned respondents for a check-in — i.e. this field worker's
 * active caseload, scoped to the program they checked in for (or all of
 * their active assignments if they didn't pick a program), joined against
 * whatever outcome has already been recorded for THIS check-in.
 */
export async function listTodayRespondents(req: Request, res: Response): Promise<void> {
  const tenantId = requireTenantId(req);
  const checkIn = await prisma.fieldCheckIn.findFirst({ where: { id: idParam(req), tenantId } });
  if (!checkIn) throw new ApiError(404, "Check-in not found");

  const assignments = await prisma.beneficiaryAssignment.findMany({
    where: {
      tenantId,
      userId: checkIn.userId,
      status: "ACTIVE",
      ...(checkIn.projectId ? { beneficiary: { programs: { some: { id: checkIn.projectId } } } } : {}),
    },
    include: {
      beneficiary: {
        select: { id: true, code: true, name: true, province: true, district: true, sector: true, cell: true, village: true, outcome: true },
      },
    },
    orderBy: { assignedAt: "asc" },
  });

  const visits = await prisma.fieldVisit.findMany({ where: { checkInId: checkIn.id } });
  const visitByBeneficiary = new Map(visits.map((v) => [v.beneficiaryId, v]));

  const respondents = assignments.map((a) => ({
    assignmentId: a.id,
    beneficiary: a.beneficiary,
    visit: visitByBeneficiary.get(a.beneficiaryId)
      ? {
          outcome: visitByBeneficiary.get(a.beneficiaryId)!.outcome,
          note: visitByBeneficiary.get(a.beneficiaryId)!.note,
          recordedAt: visitByBeneficiary.get(a.beneficiaryId)!.recordedAt,
        }
      : null,
  }));

  sendResponse(res, 200, "Today's respondents retrieved successfully", {
    total: respondents.length,
    completed: respondents.filter((r) => r.visit).length,
    respondents,
  });
}

/** Record (or update) one respondent's outcome for this check-in — the "attendance" step before checkout. */
export async function recordVisitOutcome(req: Request, res: Response): Promise<void> {
  const data = recordFieldVisitSchema.parse(req.body);
  const tenantId = requireTenantId(req);

  const checkIn = await prisma.fieldCheckIn.findFirst({ where: { id: idParam(req), tenantId } });
  if (!checkIn) throw new ApiError(404, "Check-in not found");
  if (checkIn.userId !== req.user!.sub && !req.user!.isPlatformAdmin) {
    throw new ApiError(403, "You can only record outcomes for your own check-in");
  }
  if (checkIn.checkOutAt) throw new ApiError(409, "This check-in has already ended");

  const beneficiaryId = req.params.beneficiaryId as string;
  const beneficiary = await prisma.beneficiary.findFirst({ where: { id: beneficiaryId, tenantId } });
  if (!beneficiary) throw new ApiError(404, "Respondent not found");

  const visit = await prisma.fieldVisit.upsert({
    where: { checkInId_beneficiaryId: { checkInId: checkIn.id, beneficiaryId } },
    update: { outcome: data.outcome, note: data.note, recordedAt: new Date() },
    create: { checkInId: checkIn.id, beneficiaryId, outcome: data.outcome, note: data.note },
  });

  // Keep the respondent's global "latest known outcome" in sync too.
  await prisma.beneficiary.update({ where: { id: beneficiaryId }, data: { outcome: data.outcome } });

  await recordActivity({
    tenantId,
    userId: req.user!.sub,
    action: "recorded outcome",
    entityType: "FieldVisit",
    entityId: visit.id,
    metadata: { beneficiary: beneficiary.name, outcome: data.outcome },
  });

  sendResponse(res, 200, "Outcome recorded successfully", visit);
}

export async function addFieldNote(req: Request, res: Response): Promise<void> {
  const data = addFieldNoteSchema.parse(req.body);
  const tenantId = requireTenantId(req);
  const checkIn = await prisma.fieldCheckIn.findFirst({ where: { id: idParam(req), tenantId } });
  if (!checkIn) throw new ApiError(404, "Check-in not found");
  if (checkIn.userId !== req.user!.sub && !req.user!.isPlatformAdmin) {
    throw new ApiError(403, "You can only add notes to your own check-in");
  }

  const note = await prisma.fieldNote.create({ data: { checkInId: checkIn.id, note: data.note } });
  sendResponse(res, 201, "Note added successfully", note);
}

export async function listFieldNotes(req: Request, res: Response): Promise<void> {
  const tenantId = requireTenantId(req);
  const checkIn = await prisma.fieldCheckIn.findFirst({ where: { id: idParam(req), tenantId } });
  if (!checkIn) throw new ApiError(404, "Check-in not found");
  const notes = await prisma.fieldNote.findMany({ where: { checkInId: checkIn.id }, orderBy: { createdAt: "asc" } });
  sendResponse(res, 200, "Field notes retrieved successfully", notes);
}

export async function pingCurrentGps(req: Request, res: Response): Promise<void> {
  const data = currentGpsSchema.parse(req.body);
  const tenantId = requireTenantId(req);
  const checkIn = await prisma.fieldCheckIn.findFirst({ where: { id: idParam(req), tenantId } });
  if (!checkIn) throw new ApiError(404, "Check-in not found");
  if (checkIn.userId !== req.user!.sub) throw new ApiError(403, "You can only update your own location");

  const updated = await prisma.fieldCheckIn.update({
    where: { id: checkIn.id },
    data: { currentGpsLat: data.gpsLat, currentGpsLng: data.gpsLng, currentGpsAt: new Date(), currentGpsNote: data.note },
    include,
  });
  sendResponse(res, 200, "Location updated", updated);
}

interface RosterEntry {
  userId: string;
  name: string;
  email: string;
  checkIn: {
    id: string;
    checkInAt: Date;
    checkOutAt: Date | null;
    gpsLat: number | null;
    gpsLng: number | null;
    currentGpsLat: number | null;
    currentGpsLng: number | null;
    currentGpsAt: Date | null;
  } | null;
  assigned: number;
  completed: number;
  refused: number;
  notFound: number;
  replaced: number;
}

async function buildRoster(tenantId: string, programId: string | undefined, dateStr: string): Promise<RosterEntry[]> {
  const dayStart = new Date(`${dateStr}T00:00:00.000Z`);
  const dayEnd = new Date(`${dateStr}T23:59:59.999Z`);

  const staffAssignments = await prisma.programAssignment.findMany({
    where: { tenantId, status: "ACTIVE", ...(programId ? { programId } : {}) },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
  const staffMap = new Map(staffAssignments.map((a) => [a.userId, a.user]));

  const checkIns = await prisma.fieldCheckIn.findMany({
    where: { tenantId, ...(programId ? { projectId: programId } : {}), checkInAt: { gte: dayStart, lte: dayEnd } },
  });
  for (const c of checkIns) if (!staffMap.has(c.userId)) staffMap.set(c.userId, { id: c.userId, name: null, email: "" });

  const checkInByUser = new Map(checkIns.map((c) => [c.userId, c]));

  const roster: RosterEntry[] = [];
  for (const [userId, user] of staffMap) {
    const checkIn = checkInByUser.get(userId) ?? null;

    const assignedCount = programId
      ? await prisma.beneficiaryAssignment.count({
          where: { tenantId, userId, status: "ACTIVE", beneficiary: { programs: { some: { id: programId } } } },
        })
      : await prisma.beneficiaryAssignment.count({ where: { tenantId, userId, status: "ACTIVE" } });

    let completed = 0;
    let refused = 0;
    let notFound = 0;
    let replaced = 0;
    if (checkIn) {
      const visits = await prisma.fieldVisit.findMany({ where: { checkInId: checkIn.id } });
      completed = visits.filter((v) => v.outcome === "COMPLETED").length;
      refused = visits.filter((v) => v.outcome === "REFUSED").length;
      notFound = visits.filter((v) => v.outcome === "NOT_FOUND").length;
      replaced = visits.filter((v) => v.outcome === "REPLACED").length;
    }

    roster.push({
      userId,
      name: user.name ?? user.email ?? "—",
      email: user.email ?? "",
      checkIn: checkIn
        ? {
            id: checkIn.id,
            checkInAt: checkIn.checkInAt,
            checkOutAt: checkIn.checkOutAt,
            gpsLat: checkIn.gpsLat,
            gpsLng: checkIn.gpsLng,
            currentGpsLat: checkIn.currentGpsLat,
            currentGpsLng: checkIn.currentGpsLng,
            currentGpsAt: checkIn.currentGpsAt,
          }
        : null,
      assigned: assignedCount,
      completed,
      refused,
      notFound,
      replaced,
    });
  }

  roster.sort((a, b) => a.name.localeCompare(b.name));
  return roster;
}

/** Supervisor's Daily Field Operations Dashboard — attendance + progress for one program on one day. */
export async function dailyRoster(req: Request, res: Response): Promise<void> {
  const tenantId = requireTenantId(req);
  const programId = typeof req.query.programId === "string" && req.query.programId ? req.query.programId : undefined;
  const date = typeof req.query.date === "string" && req.query.date ? req.query.date : new Date().toISOString().slice(0, 10);

  const roster = await buildRoster(tenantId, programId, date);

  const present = roster.filter((r) => r.checkIn).length;
  const summary = {
    date,
    programId: programId ?? null,
    staffTotal: roster.length,
    present,
    absent: roster.length - present,
    assigned: roster.reduce((s, r) => s + r.assigned, 0),
    completed: roster.reduce((s, r) => s + r.completed, 0),
    refused: roster.reduce((s, r) => s + r.refused, 0),
    notFound: roster.reduce((s, r) => s + r.notFound, 0),
    replaced: roster.reduce((s, r) => s + r.replaced, 0),
  };

  sendResponse(res, 200, "Daily roster retrieved successfully", { summary, roster });
}

export async function exportDailyReport(req: Request, res: Response): Promise<void> {
  const tenantId = requireTenantId(req);
  const programId = typeof req.query.programId === "string" && req.query.programId ? req.query.programId : undefined;
  const date = typeof req.query.date === "string" && req.query.date ? req.query.date : new Date().toISOString().slice(0, 10);
  const program = programId ? await prisma.program.findFirst({ where: { id: programId, tenantId } }) : null;

  const roster = await buildRoster(tenantId, programId, date);

  const rows: DailyReportRow[] = roster.map((r) => ({
    enumerator: r.name,
    program: program?.name ?? "All programs",
    date,
    checkIn: r.checkIn ? new Date(r.checkIn.checkInAt).toLocaleString() : "—",
    checkOut: r.checkIn?.checkOutAt ? new Date(r.checkIn.checkOutAt).toLocaleString() : "—",
    assigned: r.assigned,
    completed: r.completed,
    refused: r.refused,
    notFound: r.notFound,
    replaced: r.replaced,
    gps:
      r.checkIn?.currentGpsLat && r.checkIn?.currentGpsLng
        ? `${r.checkIn.currentGpsLat.toFixed(4)}, ${r.checkIn.currentGpsLng.toFixed(4)}`
        : r.checkIn?.gpsLat && r.checkIn?.gpsLng
          ? `${r.checkIn.gpsLat.toFixed(4)}, ${r.checkIn.gpsLng.toFixed(4)}`
          : "—",
  }));

  const buffer = await buildDailyReportWorkbook(rows);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="daily-field-report-${date}.xlsx"`);
  res.send(buffer);
}

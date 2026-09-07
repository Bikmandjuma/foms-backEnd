import type { Request, Response } from "express";
import { requireTenantId } from "../middleware/auth.js";
import { ApiError } from "../middleware/errorHandler.js";
import { sendResponse } from "../utils/apiResponse.js";
import { prisma } from "../utils/prisma.js";
import { recordActivity } from "../utils/activityLog.js";
import {
  upsertMealTransportConfigSchema,
  createMealTransportReportSchema,
  upsertMealTransportEntrySchema,
  signMealTransportReportSchema,
} from "../utils/validators.js";
import { buildMealTransportReportPdf } from "../utils/pdf.js";
import { buildMealTransportReportWorkbook } from "../utils/excel.js";

function idParam(req: Request): string {
  return req.params.id as string;
}

/** Monday-to-Sunday bounds for the calendar week containing `d`. */
/** Monday-anchored period bounds spanning `periodDays` days — 7 for a full
 * calendar week, 5 for a Mon-Fri work week, or whatever a config sets.
 * Never hardcoded to 7; every caller passes the config's own value. */
function getWeekBounds(d: Date, periodDays: number): { start: Date; end: Date } {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  const day = date.getDay(); // 0 = Sunday
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const start = new Date(date);
  start.setDate(date.getDate() + diffToMonday);
  const end = new Date(start);
  end.setDate(start.getDate() + (periodDays - 1));
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function computeTotals(entries: { mealUsd: number; accommodationUsd: number; transportUsd: number }[]) {
  const totalMeal = entries.reduce((s, e) => s + e.mealUsd, 0);
  const totalAccommodation = entries.reduce((s, e) => s + e.accommodationUsd, 0);
  const totalTransport = entries.reduce((s, e) => s + e.transportUsd, 0);
  return { totalMeal, totalAccommodation, totalTransport, grandTotal: totalMeal + totalAccommodation + totalTransport };
}

const reportInclude = {
  config: {
    include: {
      submitterRole: { select: { id: true, name: true } },
      approver: { select: { id: true, name: true, role: { select: { name: true } } } },
      program: { select: { id: true, name: true } },
    },
  },
  user: { select: { id: true, name: true, roleId: true } },
  entries: { orderBy: { date: "asc" as const } },
};

/** Loads a report and checks the caller may see it — its own preparer, its
 * config's approver, or someone with tenant-wide manage access. */
async function loadReportForViewer(req: Request, reportId: string) {
  const tenantId = requireTenantId(req);
  const report = await prisma.mealTransportReport.findFirst({ where: { id: reportId, tenantId }, include: reportInclude });
  if (!report) throw new ApiError(404, "Report not found");

  const isPreparer = report.userId === req.user!.sub;
  const isApprover = report.config.approverUserId === req.user!.sub;
  const isManager = await hasManagePermission(req);
  if (!isPreparer && !isApprover && !isManager) throw new ApiError(403, "You don't have access to this report");
  return { report, isPreparer, isApprover, isManager };
}

async function hasManagePermission(req: Request): Promise<boolean> {
  if (req.user!.isPlatformAdmin) return true;
  if (!req.user!.roleId) return false;
  const { hasAction, parsePermissions } = await import("../utils/permissions.js");
  const role = await prisma.role.findUnique({ where: { id: req.user!.roleId }, select: { permissions: true } });
  return hasAction(parsePermissions(role?.permissions), "meal-transport-reports:manage");
}

/** A lighter-weight permission than "manage" — lets someone make their own
 * reports (picking a project, same as a manager can) without granting
 * them config/admin access over everyone else's reports. */
async function hasCreatePermission(req: Request): Promise<boolean> {
  if (req.user!.isPlatformAdmin) return true;
  if (!req.user!.roleId) return false;
  const { hasAction, parsePermissions } = await import("../utils/permissions.js");
  const role = await prisma.role.findUnique({ where: { id: req.user!.roleId }, select: { permissions: true } });
  const perms = parsePermissions(role?.permissions);
  return hasAction(perms, "meal-transport-reports:create") || hasAction(perms, "meal-transport-reports:manage");
}

// --- Config -------------------------------------------------------------

export async function listMealTransportConfigs(req: Request, res: Response): Promise<void> {
  const tenantId = requireTenantId(req);
  const isManager = await hasManagePermission(req);
  if (!isManager && !(await hasCreatePermission(req))) {
    throw new ApiError(403, "You don't have permission to perform this action (meal-transport-reports:manage)");
  }
  const configs = await prisma.mealTransportReportConfig.findMany({
    where: { tenantId },
    include: {
      submitterRole: { select: { id: true, name: true } },
      approver: { select: { id: true, name: true, role: { select: { name: true } } } },
      program: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  sendResponse(res, 200, "Meal & transport report configs retrieved successfully", configs);
}

export async function upsertMealTransportConfig(req: Request, res: Response): Promise<void> {
  const data = upsertMealTransportConfigSchema.parse(req.body);
  const tenantId = requireTenantId(req);

  const role = await prisma.role.findFirst({ where: { id: data.submitterRoleId, tenantId } });
  if (!role) throw new ApiError(404, "Role not found");
  const approver = await prisma.user.findFirst({ where: { id: data.approverUserId, tenantId } });
  if (!approver) throw new ApiError(404, "Approver not found");
  const program = await prisma.program.findFirst({ where: { id: data.programId, tenantId } });
  if (!program) throw new ApiError(404, "Program not found");

  const config = await prisma.mealTransportReportConfig.upsert({
    where: { tenantId_submitterRoleId: { tenantId, submitterRoleId: data.submitterRoleId } },
    create: {
      tenantId,
      submitterRoleId: data.submitterRoleId,
      approverUserId: data.approverUserId,
      programId: data.programId,
      title: data.title ?? "",
      subtitle: data.subtitle ?? "Weekly Meal & Transport Expense Report Form",
      periodDays: data.periodDays ?? 7,
    },
    update: {
      approverUserId: data.approverUserId,
      programId: data.programId,
      ...(data.title !== undefined ? { title: data.title } : {}),
      ...(data.subtitle !== undefined ? { subtitle: data.subtitle } : {}),
      ...(data.periodDays !== undefined ? { periodDays: data.periodDays } : {}),
    },
    include: {
      submitterRole: { select: { id: true, name: true } },
      approver: { select: { id: true, name: true, role: { select: { name: true } } } },
      program: { select: { id: true, name: true } },
    },
  });

  await recordActivity({
    tenantId,
    userId: req.user!.sub,
    action: "configured meal & transport reports for role",
    entityType: "MealTransportReportConfig",
    entityId: config.id,
    metadata: { role: role.name },
  });

  sendResponse(res, 200, "Configuration saved successfully", config);
}

export async function deleteMealTransportConfig(req: Request, res: Response): Promise<void> {
  const tenantId = requireTenantId(req);
  const existing = await prisma.mealTransportReportConfig.findFirst({ where: { id: idParam(req), tenantId } });
  if (!existing) throw new ApiError(404, "Configuration not found");
  await prisma.mealTransportReportConfig.delete({ where: { id: existing.id } });
  sendResponse(res, 200, "Configuration removed successfully", null);
}

/** What the authenticated user needs to know before making their own
 * report: whether their role is configured as a submitter at all. */
export async function getMyMealTransportConfig(req: Request, res: Response): Promise<void> {
  const tenantId = requireTenantId(req);
  if (!req.user!.roleId) {
    sendResponse(res, 200, "No configuration for this role", null);
    return;
  }
  const config = await prisma.mealTransportReportConfig.findFirst({
    where: { tenantId, submitterRoleId: req.user!.roleId },
    include: { submitterRole: { select: { id: true, name: true } } },
  });
  sendResponse(res, 200, "Configuration retrieved successfully", config);
}

// --- Reports --------------------------------------------------------------

/** "Make a report of today" — finds this week's report for the caller if
 * one already exists (so reopening it mid-week never creates a duplicate),
 * otherwise creates it against the caller's role's config. */
export async function getOrCreateCurrentWeekReport(req: Request, res: Response): Promise<void> {
  const tenantId = requireTenantId(req);
  const data = createMealTransportReportSchema.parse(req.body ?? {});
  const isManager = await hasManagePermission(req);
  const canCreate = isManager || (await hasCreatePermission(req));

  // Someone whose own role is configured as a submitter always uses that
  // config, same as before. Someone with manage OR the dedicated create
  // permission — who files expenses too, even if their own role was never
  // set up as a submitter — can pick which project to file under; not
  // given one, they fall back to their own role's config if it exists,
  // else the first config in the tenant, so there's always a project to
  // attach the report to as long as at least one has been configured.
  let config = req.user!.roleId
    ? await prisma.mealTransportReportConfig.findFirst({ where: { tenantId, submitterRoleId: req.user!.roleId } })
    : null;

  if (data.configId && canCreate) {
    const requested = await prisma.mealTransportReportConfig.findFirst({ where: { id: data.configId, tenantId } });
    if (!requested) throw new ApiError(404, "Configuration not found");
    config = requested;
  } else if (!config && canCreate) {
    config = await prisma.mealTransportReportConfig.findFirst({ where: { tenantId }, orderBy: { createdAt: "asc" } });
  }

  if (!config) throw new ApiError(403, "There's no meal & transport report configured for you yet");

  // The person responsible for managing this (manage/create permission)
  // picks the From/To dates themselves rather than trusting a silently
  // auto-computed range; a regular role-based submitter always gets the
  // auto-computed current period and can't override it.
  const { start, end } =
    canCreate && data.weekStart && data.weekEnd
      ? { start: data.weekStart, end: data.weekEnd }
      : getWeekBounds(new Date(), config.periodDays);

  const existing = await prisma.mealTransportReport.findFirst({
    where: { userId: req.user!.sub, weekStart: start },
    include: reportInclude,
  });
  if (existing) {
    sendResponse(res, 200, "This week's report", { ...existing, ...computeTotals(existing.entries) });
    return;
  }

  const weekNumber = (await prisma.mealTransportReport.count({ where: { userId: req.user!.sub } })) + 1;
  const report = await prisma.mealTransportReport.create({
    data: { tenantId, configId: config.id, userId: req.user!.sub, weekNumber, weekStart: start, weekEnd: end },
    include: reportInclude,
  });

  sendResponse(res, 201, "This week's report created", { ...report, ...computeTotals(report.entries) });
}

export async function listMyMealTransportReports(req: Request, res: Response): Promise<void> {
  const tenantId = requireTenantId(req);
  const reports = await prisma.mealTransportReport.findMany({
    where: { tenantId, userId: req.user!.sub },
    include: reportInclude,
    orderBy: { weekNumber: "desc" },
  });
  sendResponse(res, 200, "Your reports retrieved successfully", reports.map((r) => ({ ...r, ...computeTotals(r.entries) })));
}

/** Admin/approver view — reports for a given submitter role, or everything
 * awaiting *this* caller's own signature as approver. */
export async function listMealTransportReports(req: Request, res: Response): Promise<void> {
  const tenantId = requireTenantId(req);
  const roleId = typeof req.query.roleId === "string" ? req.query.roleId : undefined;
  const isManager = await hasManagePermission(req);

  const reports = await prisma.mealTransportReport.findMany({
    where: {
      tenantId,
      config: {
        ...(roleId ? { submitterRoleId: roleId } : {}),
        ...(isManager ? {} : { approverUserId: req.user!.sub }),
      },
    },
    include: reportInclude,
    orderBy: [{ userId: "asc" }, { weekNumber: "desc" }],
  });
  sendResponse(res, 200, "Reports retrieved successfully", reports.map((r) => ({ ...r, ...computeTotals(r.entries) })));
}

export async function getMealTransportReport(req: Request, res: Response): Promise<void> {
  const { report } = await loadReportForViewer(req, idParam(req));
  sendResponse(res, 200, "Report retrieved successfully", { ...report, ...computeTotals(report.entries) });
}

/** Modal-driven daily entry — create or update one day's row. Editing after
 * the preparer has already signed rolls the report back to DRAFT and clears
 * that signature, since a signed submission whose numbers just changed
 * needs signing again rather than silently drifting from what was signed. */
export async function upsertMealTransportEntry(req: Request, res: Response): Promise<void> {
  const data = upsertMealTransportEntrySchema.parse(req.body);
  const { report, isPreparer } = await loadReportForViewer(req, idParam(req));
  if (!isPreparer) throw new ApiError(403, "Only the report's preparer can add entries");
  if (report.status === "APPROVED") throw new ApiError(409, "This report is already approved and can't be edited");

  if (data.date < report.weekStart || data.date > report.weekEnd) {
    throw new ApiError(400, "That date falls outside this report's week");
  }

  await prisma.mealTransportReportEntry.upsert({
    where: { reportId_date: { reportId: report.id, date: data.date } },
    create: { reportId: report.id, date: data.date, mealUsd: data.mealUsd, accommodationUsd: data.accommodationUsd, transportUsd: data.transportUsd },
    update: { mealUsd: data.mealUsd, accommodationUsd: data.accommodationUsd, transportUsd: data.transportUsd },
  });

  const updated = await prisma.mealTransportReport.update({
    where: { id: report.id },
    data:
      report.status === "PENDING_APPROVAL"
        ? { status: "DRAFT", preparerSignatureName: null, preparerSignatureImage: null, preparerSignedAt: null }
        : {},
    include: reportInclude,
  });

  sendResponse(res, 200, "Entry saved successfully", { ...updated, ...computeTotals(updated.entries) });
}

export async function deleteMealTransportEntry(req: Request, res: Response): Promise<void> {
  const { report, isPreparer } = await loadReportForViewer(req, req.params.id as string);
  if (!isPreparer) throw new ApiError(403, "Only the report's preparer can remove entries");
  if (report.status === "APPROVED") throw new ApiError(409, "This report is already approved and can't be edited");

  await prisma.mealTransportReportEntry.deleteMany({ where: { id: req.params.entryId as string, reportId: report.id } });
  const updated = await prisma.mealTransportReport.findUniqueOrThrow({ where: { id: report.id }, include: reportInclude });
  sendResponse(res, 200, "Entry removed successfully", { ...updated, ...computeTotals(updated.entries) });
}

/** The preparer's digital signature — a typed, confirmed name placed on the
 * report, moving it to PENDING_APPROVAL for the configured approver. */
export async function signAsPreparer(req: Request, res: Response): Promise<void> {
  const data = signMealTransportReportSchema.parse(req.body);
  const { report, isPreparer } = await loadReportForViewer(req, idParam(req));
  if (!isPreparer) throw new ApiError(403, "Only the report's preparer can sign here");
  if (report.status === "APPROVED") throw new ApiError(409, "This report is already approved");

  const updated = await prisma.mealTransportReport.update({
    where: { id: report.id },
    data: {
      preparerSignatureName: data.signatureName,
      preparerSignatureImage: data.signatureImage,
      preparerSignedAt: new Date(),
      status: "PENDING_APPROVAL",
    },
    include: reportInclude,
  });

  await recordActivity({
    tenantId: report.tenantId,
    userId: req.user!.sub,
    action: "signed and submitted meal & transport report for",
    entityType: "MealTransportReport",
    entityId: report.id,
    metadata: { week: report.weekNumber },
  });

  sendResponse(res, 200, "Report signed and submitted for approval", { ...updated, ...computeTotals(updated.entries) });
}

/** The configured approver's own digital signature — completes the report. */
export async function signAsApprover(req: Request, res: Response): Promise<void> {
  const data = signMealTransportReportSchema.parse(req.body);
  const { report, isApprover } = await loadReportForViewer(req, idParam(req));
  if (!isApprover) throw new ApiError(403, "Only this report's assigned approver can sign here");
  if (report.status !== "PENDING_APPROVAL") throw new ApiError(409, "This report isn't awaiting approval yet");

  const updated = await prisma.mealTransportReport.update({
    where: { id: report.id },
    data: {
      approverSignatureName: data.signatureName,
      approverSignatureImage: data.signatureImage,
      approverSignedAt: new Date(),
      status: "APPROVED",
    },
    include: reportInclude,
  });

  await recordActivity({
    tenantId: report.tenantId,
    userId: req.user!.sub,
    action: "approved meal & transport report for",
    entityType: "MealTransportReport",
    entityId: report.id,
    metadata: { week: report.weekNumber, preparer: updated.user.name },
  });

  sendResponse(res, 200, "Report approved", { ...updated, ...computeTotals(updated.entries) });
}

export async function exportMealTransportReport(req: Request, res: Response): Promise<void> {
  const { report } = await loadReportForViewer(req, idParam(req));
  const totals = computeTotals(report.entries);
  const format = typeof req.query.format === "string" ? req.query.format.toLowerCase() : "pdf";

  const weekLabel = `week-${report.weekNumber}`;
  if (format === "xlsx") {
    const buffer = await buildMealTransportReportWorkbook(report, totals);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="meal-transport-report-${weekLabel}.xlsx"`);
    res.send(buffer);
    return;
  }
  if (format !== "pdf") {
    res.status(400).json({ statusCode: 400, message: "format must be 'pdf' or 'xlsx'", data: null });
    return;
  }
  const buffer = await buildMealTransportReportPdf(report, totals);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="meal-transport-report-${weekLabel}.pdf"`);
  res.send(buffer);
}

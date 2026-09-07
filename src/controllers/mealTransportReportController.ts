import type { Request, Response } from "express";
import { ZipArchive } from "archiver";
import { requireTenantId } from "../middleware/auth.js";
import { ApiError } from "../middleware/errorHandler.js";
import { sendResponse } from "../utils/apiResponse.js";
import { prisma } from "../utils/prisma.js";
import { recordActivity } from "../utils/activityLog.js";
import {
  upsertMealTransportConfigSchema,
  createMealTransportReportWeekSchema,
  updateMealTransportReportWeekSchema,
  createMealTransportReportSchema,
  upsertMealTransportEntrySchema,
  signMealTransportReportSchema,
} from "../utils/validators.js";
import { buildMealTransportReportPdf } from "../utils/pdf.js";
import { buildMealTransportReportWorkbook } from "../utils/excel.js";

function idParam(req: Request): string {
  return req.params.id as string;
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
  week: true,
  user: { select: { id: true, name: true, roleId: true } },
  entries: { orderBy: { date: "asc" as const } },
};

/** Loads a report and checks the caller may see it: its own preparer, its
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

/** A lighter-weight permission than "manage": lets someone make their own
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

// --- Config -----------------------------------------------------------

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
    },
    update: {
      approverUserId: data.approverUserId,
      programId: data.programId,
      ...(data.title !== undefined ? { title: data.title } : {}),
      ...(data.subtitle !== undefined ? { subtitle: data.subtitle } : {}),
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
    include: { submitterRole: { select: { id: true, name: true } }, program: { select: { id: true, name: true } } },
  });
  sendResponse(res, 200, "Configuration retrieved successfully", config);
}

// --- Weeks (the reporting schedule) ------------------------------------

/** Every week scheduled for a program, enabled or not, for whoever manages
 * this to review, edit, and toggle. */
export async function listWeeksForProgram(req: Request, res: Response): Promise<void> {
  const tenantId = requireTenantId(req);
  const isManager = await hasManagePermission(req);
  if (!isManager && !(await hasCreatePermission(req))) {
    throw new ApiError(403, "You don't have permission to perform this action (meal-transport-reports:manage)");
  }
  const programId = typeof req.query.programId === "string" ? req.query.programId : undefined;
  if (!programId) throw new ApiError(400, "programId query parameter is required");

  const weeks = await prisma.mealTransportReportWeek.findMany({
    where: { tenantId, programId },
    orderBy: { weekStart: "asc" },
  });
  sendResponse(res, 200, "Weeks retrieved successfully", weeks);
}

/** Creates a new scheduled reporting period, disabled by default until
 * whoever manages this switches it on. */
export async function createMealTransportReportWeek(req: Request, res: Response): Promise<void> {
  const data = createMealTransportReportWeekSchema.parse(req.body);
  const tenantId = requireTenantId(req);

  const program = await prisma.program.findFirst({ where: { id: data.programId, tenantId } });
  if (!program) throw new ApiError(404, "Program not found");

  const week = await prisma.mealTransportReportWeek.create({
    data: { tenantId, programId: data.programId, label: data.label, weekStart: data.weekStart, weekEnd: data.weekEnd },
  });

  await recordActivity({
    tenantId,
    userId: req.user!.sub,
    action: "scheduled a meal & transport report week for",
    entityType: "MealTransportReportWeek",
    entityId: week.id,
    metadata: { program: program.name, label: data.label },
  });

  sendResponse(res, 201, "Week scheduled successfully", week);
}

/** Edits a scheduled week, most commonly toggling it enabled or disabled.
 * Enabling a week makes it visible to every eligible submitter on that
 * program; disabling hides it from anyone who hasn't already started a
 * report against it. */
export async function updateMealTransportReportWeek(req: Request, res: Response): Promise<void> {
  const data = updateMealTransportReportWeekSchema.parse(req.body);
  const tenantId = requireTenantId(req);
  const existing = await prisma.mealTransportReportWeek.findFirst({ where: { id: idParam(req), tenantId } });
  if (!existing) throw new ApiError(404, "Week not found");

  const week = await prisma.mealTransportReportWeek.update({ where: { id: existing.id }, data });

  if (data.enabled !== undefined && data.enabled !== existing.enabled) {
    await recordActivity({
      tenantId,
      userId: req.user!.sub,
      action: data.enabled ? "enabled meal & transport report week" : "disabled meal & transport report week",
      entityType: "MealTransportReportWeek",
      entityId: week.id,
      metadata: { label: week.label },
    });
  }

  sendResponse(res, 200, "Week updated successfully", week);
}

export async function deleteMealTransportReportWeek(req: Request, res: Response): Promise<void> {
  const tenantId = requireTenantId(req);
  const existing = await prisma.mealTransportReportWeek.findFirst({ where: { id: idParam(req), tenantId } });
  if (!existing) throw new ApiError(404, "Week not found");
  await prisma.mealTransportReportWeek.delete({ where: { id: existing.id } });
  sendResponse(res, 200, "Week removed successfully", null);
}

/** The weeks an eligible submitter can actually see: enabled weeks on
 * their own config's program, each flagged with whether they already
 * have a report started against it. */
export async function listEligibleWeeksForMe(req: Request, res: Response): Promise<void> {
  const tenantId = requireTenantId(req);
  if (!req.user!.roleId) {
    sendResponse(res, 200, "Eligible weeks retrieved successfully", []);
    return;
  }
  const config = await prisma.mealTransportReportConfig.findFirst({ where: { tenantId, submitterRoleId: req.user!.roleId } });
  if (!config) {
    sendResponse(res, 200, "Eligible weeks retrieved successfully", []);
    return;
  }

  const weeks = await prisma.mealTransportReportWeek.findMany({
    where: { tenantId, programId: config.programId, enabled: true },
    orderBy: { weekStart: "desc" },
  });
  const myReports = await prisma.mealTransportReport.findMany({
    where: { userId: req.user!.sub, weekId: { in: weeks.map((w) => w.id) } },
    select: { id: true, weekId: true, status: true },
  });
  const reportByWeek = new Map(myReports.map((r) => [r.weekId, r]));

  sendResponse(
    res,
    200,
    "Eligible weeks retrieved successfully",
    weeks.map((w) => ({ ...w, myReport: reportByWeek.get(w.id) ?? null }))
  );
}

/** For whoever manages this: every configured submitter role on a week's
 * program, how many people hold that role, and how many have already made
 * their report for this specific week. */
export async function getWeekRoleSummary(req: Request, res: Response): Promise<void> {
  const tenantId = requireTenantId(req);
  const week = await prisma.mealTransportReportWeek.findFirst({ where: { id: req.params.weekId as string, tenantId } });
  if (!week) throw new ApiError(404, "Week not found");

  const configs = await prisma.mealTransportReportConfig.findMany({
    where: { tenantId, programId: week.programId },
    include: { submitterRole: { select: { id: true, name: true } } },
  });

  const roleSummaries = await Promise.all(
    configs.map(async (config) => {
      const [totalUsers, reports] = await Promise.all([
        prisma.user.count({ where: { tenantId, roleId: config.submitterRoleId } }),
        prisma.mealTransportReport.findMany({
          where: { weekId: week.id, configId: config.id },
          select: { status: true },
        }),
      ]);
      return {
        configId: config.id,
        roleId: config.submitterRoleId,
        roleName: config.submitterRole.name,
        totalUsers,
        madeCount: reports.length,
        notMadeCount: Math.max(0, totalUsers - reports.length),
        draftCount: reports.filter((r) => r.status === "DRAFT").length,
        pendingCount: reports.filter((r) => r.status === "PENDING_APPROVAL").length,
        approvedCount: reports.filter((r) => r.status === "APPROVED").length,
      };
    })
  );

  sendResponse(res, 200, "Week summary retrieved successfully", { week, roles: roleSummaries });
}

/** Every report made for a week under one role, so whoever manages this
 * can drill from the role card into the actual people. */
export async function listReportsForWeekAndRole(req: Request, res: Response): Promise<void> {
  const tenantId = requireTenantId(req);
  const weekId = req.params.weekId as string;
  const roleId = typeof req.query.roleId === "string" ? req.query.roleId : undefined;
  if (!roleId) throw new ApiError(400, "roleId query parameter is required");

  const reports = await prisma.mealTransportReport.findMany({
    where: { tenantId, weekId, config: { submitterRoleId: roleId } },
    include: reportInclude,
    orderBy: { user: { name: "asc" } },
  });
  sendResponse(res, 200, "Reports retrieved successfully", reports.map((r) => ({ ...r, ...computeTotals(r.entries) })));
}

/** A zipped bundle of every report made for a week under one role, each
 * exported as PDF or Excel. */
export async function exportWeekRoleZip(req: Request, res: Response): Promise<void> {
  const tenantId = requireTenantId(req);
  const weekId = req.params.weekId as string;
  const roleId = typeof req.query.roleId === "string" ? req.query.roleId : undefined;
  const format = typeof req.query.format === "string" ? req.query.format.toLowerCase() : "pdf";
  if (!roleId) throw new ApiError(400, "roleId query parameter is required");
  if (format !== "pdf" && format !== "xlsx") throw new ApiError(400, "format must be 'pdf' or 'xlsx'");

  const week = await prisma.mealTransportReportWeek.findFirst({ where: { id: weekId, tenantId } });
  if (!week) throw new ApiError(404, "Week not found");

  const reports = await prisma.mealTransportReport.findMany({
    where: { tenantId, weekId, config: { submitterRoleId: roleId } },
    include: reportInclude,
    orderBy: { user: { name: "asc" } },
  });
  if (reports.length === 0) throw new ApiError(404, "No reports have been made for this role yet");

  const roleName = reports[0]!.config.submitterRole.name;
  // Only the filename itself gets sanitized here, the surrounding
  // "attachment; filename=..." syntax must keep its own spaces or the
  // header becomes invalid and browsers silently fail the download.
  const safeFilename = `${week.label}-${roleName}-reports.zip`.replace(/\s+/g, "-");
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="${safeFilename}"`);

  const archive = new ZipArchive({ zlib: { level: 9 } });
  archive.on("error", (err: Error) => {
    throw err;
  });
  archive.pipe(res);

  for (const report of reports) {
    const totals = computeTotals(report.entries);
    const safeName = (report.user.name ?? "unknown").replace(/[^a-z0-9]+/gi, "-");
    const buffer =
      format === "xlsx" ? await buildMealTransportReportWorkbook(report, totals) : await buildMealTransportReportPdf(report, totals);
    archive.append(buffer, { name: `${safeName}.${format}` });
  }

  await archive.finalize();
}

// --- Reports -------------------------------------------------------------

/** Opens the caller's own report for a specific enabled week, creating it
 * on first visit. Idempotent: reopening it just returns the same report. */
export async function getOrCreateReportForWeek(req: Request, res: Response): Promise<void> {
  const tenantId = requireTenantId(req);
  const weekId = req.params.weekId as string;
  const data = createMealTransportReportSchema.parse(req.body ?? {});
  const isManager = await hasManagePermission(req);
  const canCreate = isManager || (await hasCreatePermission(req));

  const week = await prisma.mealTransportReportWeek.findFirst({ where: { id: weekId, tenantId } });
  if (!week) throw new ApiError(404, "Week not found");
  if (!week.enabled && !isManager) throw new ApiError(403, "This week isn't open for reports yet");

  // Someone whose own role is configured as a submitter on this week's
  // program always uses that config. Someone with manage or the dedicated
  // create permission, who files expenses too even if their own role was
  // never set up as a submitter, can pick which config to file under with
  // an explicit configId, or falls back to whichever config exists for
  // this week's program.
  let config = req.user!.roleId
    ? await prisma.mealTransportReportConfig.findFirst({ where: { tenantId, submitterRoleId: req.user!.roleId, programId: week.programId } })
    : null;

  if (data.configId && canCreate) {
    const requested = await prisma.mealTransportReportConfig.findFirst({ where: { id: data.configId, tenantId, programId: week.programId } });
    if (!requested) throw new ApiError(404, "Configuration not found for this week's program");
    config = requested;
  } else if (!config && canCreate) {
    config = await prisma.mealTransportReportConfig.findFirst({ where: { tenantId, programId: week.programId }, orderBy: { createdAt: "asc" } });
  }

  if (!config) throw new ApiError(403, "There's no meal & transport report configured for you on this program");

  const existing = await prisma.mealTransportReport.findFirst({ where: { userId: req.user!.sub, weekId }, include: reportInclude });
  if (existing) {
    sendResponse(res, 200, "Report for this week", { ...existing, ...computeTotals(existing.entries) });
    return;
  }

  const report = await prisma.mealTransportReport.create({
    data: { tenantId, configId: config.id, weekId, userId: req.user!.sub },
    include: reportInclude,
  });

  sendResponse(res, 201, "Report created for this week", { ...report, ...computeTotals(report.entries) });
}

export async function listMyMealTransportReports(req: Request, res: Response): Promise<void> {
  const tenantId = requireTenantId(req);
  const reports = await prisma.mealTransportReport.findMany({
    where: { tenantId, userId: req.user!.sub },
    include: reportInclude,
    orderBy: { week: { weekStart: "desc" } },
  });
  sendResponse(res, 200, "Your reports retrieved successfully", reports.map((r) => ({ ...r, ...computeTotals(r.entries) })));
}

/** Admin/approver view: reports for a given submitter role and/or week, or
 * everything awaiting *this* caller's own signature as approver. */
export async function listMealTransportReports(req: Request, res: Response): Promise<void> {
  const tenantId = requireTenantId(req);
  const roleId = typeof req.query.roleId === "string" ? req.query.roleId : undefined;
  const weekId = typeof req.query.weekId === "string" ? req.query.weekId : undefined;
  const isManager = await hasManagePermission(req);

  const reports = await prisma.mealTransportReport.findMany({
    where: {
      tenantId,
      ...(weekId ? { weekId } : {}),
      config: {
        ...(roleId ? { submitterRoleId: roleId } : {}),
        ...(isManager ? {} : { approverUserId: req.user!.sub }),
      },
    },
    include: reportInclude,
    orderBy: [{ user: { name: "asc" } }, { week: { weekStart: "desc" } }],
  });
  sendResponse(res, 200, "Reports retrieved successfully", reports.map((r) => ({ ...r, ...computeTotals(r.entries) })));
}

export async function getMealTransportReport(req: Request, res: Response): Promise<void> {
  const { report } = await loadReportForViewer(req, idParam(req));
  sendResponse(res, 200, "Report retrieved successfully", { ...report, ...computeTotals(report.entries) });
}

/** Modal-driven daily entry: create or update one day's row. Editing after
 * the preparer has already signed rolls the report back to DRAFT and
 * clears that signature, since a signed submission whose numbers just
 * changed needs signing again rather than silently drifting from what was
 * signed. */
export async function upsertMealTransportEntry(req: Request, res: Response): Promise<void> {
  const data = upsertMealTransportEntrySchema.parse(req.body);
  const { report, isPreparer } = await loadReportForViewer(req, idParam(req));
  if (!isPreparer) throw new ApiError(403, "Only the report's preparer can add entries");
  if (report.status === "APPROVED") throw new ApiError(409, "This report is already approved and can't be edited");

  if (data.date < report.week.weekStart || data.date > report.week.weekEnd) {
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

/** The preparer's signature: either a real hand-drawn image from the
 * canvas signature pad, or, when they chose "Name" instead, just the
 * typed name, rendered in a signature-style font. Either way it moves the
 * report to PENDING_APPROVAL for the configured approver. */
export async function signAsPreparer(req: Request, res: Response): Promise<void> {
  const data = signMealTransportReportSchema.parse(req.body);
  const { report, isPreparer } = await loadReportForViewer(req, idParam(req));
  if (!isPreparer) throw new ApiError(403, "Only the report's preparer can sign here");
  if (report.status === "APPROVED") throw new ApiError(409, "This report is already approved");

  const updated = await prisma.mealTransportReport.update({
    where: { id: report.id },
    data: {
      preparerSignatureName: data.signatureName,
      preparerSignatureImage: data.signatureImage ?? null,
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
    metadata: { week: report.week.label },
  });

  sendResponse(res, 200, "Report signed and submitted for approval", { ...updated, ...computeTotals(updated.entries) });
}

/** The configured approver's own signature: same choice of a drawn image
 * or a typed name in signature style. Completes the report. */
export async function signAsApprover(req: Request, res: Response): Promise<void> {
  const data = signMealTransportReportSchema.parse(req.body);
  const { report, isApprover } = await loadReportForViewer(req, idParam(req));
  if (!isApprover) throw new ApiError(403, "Only this report's assigned approver can sign here");
  if (report.status !== "PENDING_APPROVAL") throw new ApiError(409, "This report isn't awaiting approval yet");

  const updated = await prisma.mealTransportReport.update({
    where: { id: report.id },
    data: {
      approverSignatureName: data.signatureName,
      approverSignatureImage: data.signatureImage ?? null,
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
    metadata: { week: report.week.label, preparer: updated.user.name },
  });

  sendResponse(res, 200, "Report approved", { ...updated, ...computeTotals(updated.entries) });
}

export async function exportMealTransportReport(req: Request, res: Response): Promise<void> {
  const { report } = await loadReportForViewer(req, idParam(req));
  const totals = computeTotals(report.entries);
  const format = typeof req.query.format === "string" ? req.query.format.toLowerCase() : "pdf";

  const weekLabel = report.week.label.replace(/\s+/g, "-");
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

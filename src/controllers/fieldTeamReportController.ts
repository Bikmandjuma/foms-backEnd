import type { Request, Response } from "express";
import { requireTenantId } from "../middleware/auth.js";
import { sendResponse } from "../utils/apiResponse.js";
import { getFieldTeamReportRows, parseFieldTeamReportFilters, type FieldTeamReportRow } from "../utils/fieldTeamReport.js";
import { buildFieldTeamReportPdf } from "../utils/pdf.js";
import { buildCsv } from "../utils/csv.js";

const CSV_COLUMNS = [
  { key: "teamName", label: "Team" },
  { key: "district", label: "District" },
  { key: "supervisorName", label: "Supervisor" },
  { key: "supervisorPhone", label: "Supervisor Phone" },
  { key: "staffName", label: "Field Staff" },
  { key: "staffRole", label: "Role" },
  { key: "staffPhone", label: "Staff Phone" },
  { key: "respondentName", label: "Respondent Assigned" },
  { key: "respondentPhone", label: "Respondent Phone" },
  { key: "sector", label: "Sector" },
  { key: "cell", label: "Cell" },
  { key: "challengesObservations", label: "Challenges & Observations" },
  { key: "visitDate", label: "Visit Date" },
] as const;

/** Paginated, searchable table view — GET /field-team-reports */
export async function listFieldTeamReport(req: Request, res: Response): Promise<void> {
  const tenantId = requireTenantId(req);
  const filters = parseFieldTeamReportFilters(req.query as Record<string, unknown>);
  const allRows = await getFieldTeamReportRows(tenantId, filters);

  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
  const start = (page - 1) * pageSize;
  const rows = allRows.slice(start, start + pageSize);

  sendResponse(res, 200, "Field team report retrieved successfully", {
    rows,
    total: allRows.length,
    page,
    pageSize,
  });
}

/** Downloadable export reflecting exactly the same filters/search as the
 * table (never paginated) — GET /field-team-reports/export */
export async function exportFieldTeamReport(req: Request, res: Response): Promise<void> {
  const tenantId = requireTenantId(req);
  const filters = parseFieldTeamReportFilters(req.query as Record<string, unknown>);
  const rows = await getFieldTeamReportRows(tenantId, filters);

  const format = typeof req.query.format === "string" ? req.query.format.toLowerCase() : "pdf";
  const dateSuffix = new Date().toISOString().slice(0, 10);

  if (format === "csv") {
    const csv = buildCsv(rows, CSV_COLUMNS as unknown as { key: keyof FieldTeamReportRow; label: string }[]);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="field-team-report-${dateSuffix}.csv"`);
    res.send(csv);
    return;
  }

  if (format !== "pdf") {
    res.status(400).json({ statusCode: 400, message: "format must be 'pdf' or 'csv'", data: null });
    return;
  }

  const pdf = await buildFieldTeamReportPdf(rows, "Field Team Report");
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="field-team-report-${dateSuffix}.pdf"`);
  res.send(pdf);
}

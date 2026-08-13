import { prisma } from "./prisma.js";
import { ApiError } from "../middleware/errorHandler.js";
import type { ResponseOutcome } from "../generated/prisma/enums.js";

export interface FieldTeamReportRow {
  id: string;
  teamName: string;
  district: string | null;
  supervisorId: string | null;
  supervisorName: string | null;
  supervisorPhone: string | null;
  staffName: string;
  staffRole: string | null;
  staffPhone: string | null;
  respondentName: string | null;
  respondentPhone: string | null;
  sector: string | null;
  cell: string | null;
  status: ResponseOutcome | "NOT_ASSIGNED";
  statusLabel: string;
  notes: string | null;
  visitDate: string | null;
}

const OUTCOME_LABELS: Record<ResponseOutcome, string> = {
  PENDING: "Not yet interviewed",
  COMPLETED: "Completed",
  REFUSED: "Refused",
  NOT_FOUND: "Not found",
  RELOCATED: "Relocated",
  DECEASED: "Deceased",
  REPLACED: "Replaced",
};

/** Parses a "YYYY-MM-DD"-style query param into a Date, or throws a 400. */
function parseDateParam(value: unknown, label: string): Date | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") throw new ApiError(400, `${label} must be a date string`);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new ApiError(400, `${label} is not a valid date`);
  return date;
}

const STATUS_VALUES = new Set(["PENDING", "COMPLETED", "REFUSED", "NOT_FOUND", "RELOCATED", "DECEASED", "REPLACED", "NOT_ASSIGNED"]);
const PERIOD_VALUES = new Set(["daily", "weekly", "monthly", "yearly"]);

/** Turns a "daily/weekly/monthly/yearly" shorthand into an actual date
 * range ending now — only used when the caller didn't give explicit
 * startDate/endDate, which always win when present. */
function dateRangeForPeriod(period: string): { startDate: Date; endDate: Date } {
  const endDate = new Date();
  const startDate = new Date();
  if (period === "daily") startDate.setDate(startDate.getDate() - 1);
  else if (period === "weekly") startDate.setDate(startDate.getDate() - 7);
  else if (period === "monthly") startDate.setMonth(startDate.getMonth() - 1);
  else startDate.setFullYear(startDate.getFullYear() - 1);
  return { startDate, endDate };
}

export interface FieldTeamReportFilters {
  programId: string;
  teamId?: string;
  startDate?: Date;
  endDate?: Date;
  search?: string;
  status?: string;
}

/** Parses and validates the report's query params — shared by the list and
 * export endpoints so both apply exactly the same rules. Throws ApiError on
 * anything invalid, including an end date before the start date. */
export function parseFieldTeamReportFilters(query: Record<string, unknown>): FieldTeamReportFilters {
  const { programId, teamId, startDate: rawStart, endDate: rawEnd, search, status, period } = query;
  if (typeof programId !== "string" || !programId) {
    throw new ApiError(400, "programId query parameter is required");
  }

  let startDate = parseDateParam(rawStart, "startDate");
  let endDate = parseDateParam(rawEnd, "endDate");
  if (startDate && endDate && startDate.getTime() > endDate.getTime()) {
    throw new ApiError(400, "startDate must be on or before endDate");
  }

  // Report-period shorthand (daily/weekly/monthly/yearly) only applies when
  // no explicit date range was given — explicit dates always take priority.
  if (!startDate && !endDate && typeof period === "string" && period) {
    if (!PERIOD_VALUES.has(period)) throw new ApiError(400, "period must be one of daily, weekly, monthly, yearly");
    ({ startDate, endDate } = dateRangeForPeriod(period));
  }

  if (status !== undefined && (typeof status !== "string" || !STATUS_VALUES.has(status))) {
    throw new ApiError(400, "status must be one of PENDING, COMPLETED, REFUSED, NOT_FOUND, RELOCATED, DECEASED, REPLACED, NOT_ASSIGNED");
  }

  return {
    programId,
    teamId: typeof teamId === "string" && teamId ? teamId : undefined,
    startDate,
    endDate,
    search: typeof search === "string" && search.trim() ? search.trim().toLowerCase() : undefined,
    status: typeof status === "string" ? status : undefined,
  };
}

/**
 * One row per (team member, their currently-assigned respondent) — flattened
 * so it renders directly into a searchable, paginated table. When a date
 * range is given, only members with a recorded field visit inside that
 * window are included (the report is scoped to what happened in that
 * window); otherwise every member is shown with their latest known status.
 *
 * `canViewUnconfirmed` gates whether a visit's outcome/notes show before its
 * supervisor has confirmed it — Admin and Data Manager roles are expected
 * not to have this by default, so a row's real status stays hidden (shown
 * as "Pending confirmation") until confirmed; Supervisors, who do the
 * confirming, see everything immediately.
 */
export async function getFieldTeamReportRows(
  tenantId: string,
  filters: FieldTeamReportFilters,
  canViewUnconfirmed: boolean
): Promise<FieldTeamReportRow[]> {
  const { programId, teamId, startDate, endDate, search, status } = filters;

  const program = await prisma.program.findFirst({ where: { id: programId, tenantId } });
  if (!program) throw new ApiError(404, "Program not found");

  const teams = await prisma.programTeam.findMany({
    where: { programId, tenantId, ...(teamId ? { id: teamId } : {}) },
    include: {
      leader: { select: { id: true, name: true, telephone: true } },
      members: {
        include: {
          user: { select: { id: true, name: true, telephone: true, role: { select: { name: true } } } },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  const memberUserIds = teams.flatMap((t) => t.members.map((m) => m.userId));
  if (memberUserIds.length === 0) return [];

  const assignments = await prisma.beneficiaryAssignment.findMany({
    where: {
      userId: { in: memberUserIds },
      status: "ACTIVE",
      beneficiary: { programs: { some: { id: programId } } },
    },
    include: {
      beneficiary: {
        include: {
          district: { select: { name: true } },
          sector: { select: { name: true } },
          cell: { select: { name: true } },
        },
      },
    },
    orderBy: { assignedAt: "desc" },
  });
  // Most-recent-first ordering above means the first match kept per user is
  // their current respondent, even if they've had more than one over time.
  const assignmentByUser = new Map<string, (typeof assignments)[number]>();
  for (const a of assignments) {
    if (!assignmentByUser.has(a.userId)) assignmentByUser.set(a.userId, a);
  }

  const beneficiaryIds = assignments.map((a) => a.beneficiaryId);
  const visits =
    beneficiaryIds.length === 0
      ? []
      : await prisma.fieldVisit.findMany({
          where: {
            beneficiaryId: { in: beneficiaryIds },
            checkIn: { userId: { in: memberUserIds }, projectId: programId },
            ...(startDate || endDate
              ? {
                  recordedAt: {
                    ...(startDate ? { gte: startDate } : {}),
                    // Push endDate to the end of that calendar day so "between
                    // 2026-08-01 and 2026-08-01" includes visits recorded any
                    // time that day, not just exactly midnight.
                    ...(endDate ? { lte: new Date(endDate.getTime() + 24 * 60 * 60 * 1000 - 1) } : {}),
                  },
                }
              : {}),
          },
          include: { checkIn: { select: { userId: true } } },
          orderBy: { recordedAt: "desc" },
        });
  const visitByUserAndBeneficiary = new Map<string, (typeof visits)[number]>();
  for (const v of visits) {
    const key = `${v.checkIn.userId}:${v.beneficiaryId}`;
    if (!visitByUserAndBeneficiary.has(key)) visitByUserAndBeneficiary.set(key, v);
  }

  const dateRangeGiven = Boolean(startDate || endDate);
  const rows: FieldTeamReportRow[] = [];

  for (const team of teams) {
    for (const member of team.members) {
      const assignment = assignmentByUser.get(member.userId);
      const visit = assignment ? visitByUserAndBeneficiary.get(`${member.userId}:${assignment.beneficiaryId}`) : undefined;

      // Scoped to the window: a member with nothing recorded in it isn't
      // part of that period's report.
      if (dateRangeGiven && !visit) continue;

      // A visit the supervisor hasn't confirmed yet stays hidden from
      // viewers without canViewUnconfirmed — they see that it's pending,
      // not what was actually recorded.
      const isHiddenPendingConfirmation = Boolean(visit) && visit!.confirmationStatus !== "CONFIRMED" && !canViewUnconfirmed;

      const trueStatus: FieldTeamReportRow["status"] = !assignment ? "NOT_ASSIGNED" : visit ? visit.outcome : "PENDING";
      // The real outcome stays hidden — not just its notes — until the
      // supervisor confirms it, so an ungated "status" filter/column can't
      // be used to see the answer before it's confirmed.
      const rowStatus: FieldTeamReportRow["status"] = isHiddenPendingConfirmation ? "PENDING" : trueStatus;
      const statusLabel = isHiddenPendingConfirmation
        ? "Pending supervisor confirmation"
        : !assignment
          ? "No respondent assigned yet"
          : OUTCOME_LABELS[rowStatus as ResponseOutcome] ?? rowStatus;
      const notes = isHiddenPendingConfirmation ? null : (visit?.note?.trim() ?? null);

      if (status && rowStatus !== status) continue;

      rows.push({
        id: `${team.id}:${member.userId}`,
        teamName: team.name,
        district: assignment?.beneficiary.district?.name ?? null,
        supervisorId: team.leader?.id ?? null,
        supervisorName: team.leader?.name ?? null,
        supervisorPhone: team.leader?.telephone ?? null,
        staffName: member.user.name ?? "",
        staffRole: member.user.role?.name ?? null,
        staffPhone: member.user.telephone,
        respondentName: assignment?.beneficiary.name ?? null,
        respondentPhone: assignment?.beneficiary.telephone ?? null,
        sector: assignment?.beneficiary.sector?.name ?? null,
        cell: assignment?.beneficiary.cell?.name ?? null,
        status: rowStatus,
        statusLabel,
        notes,
        visitDate: visit?.recordedAt ? visit.recordedAt.toISOString() : null,
      });
    }
  }

  if (!search) return rows;
  return rows.filter((r) =>
    [r.teamName, r.district, r.supervisorName, r.staffName, r.staffRole, r.respondentName, r.sector, r.cell]
      .filter((v): v is string => Boolean(v))
      .some((v) => v.toLowerCase().includes(search))
  );
}

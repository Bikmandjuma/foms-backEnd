import type { Request, Response } from "express";
import { requireTenantId } from "../middleware/auth.js";
import { sendResponse } from "../utils/apiResponse.js";
import { prisma } from "../utils/prisma.js";
import { getOnlineUserIds } from "../realtime/socket.js";
import { withFullName } from "../utils/fullName.js";

function daysAgo(n: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return d;
}

function startOfPeriodsAgo(period: string, n: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (period === "week") d.setDate(d.getDate() - n * 7);
  else if (period === "month") d.setMonth(d.getMonth() - n);
  else if (period === "year") d.setFullYear(d.getFullYear() - n);
  else d.setFullYear(2000); // "lifetime" - a date far enough in the past to include everything
  return d;
}

export async function getDashboardSummary(req: Request, res: Response): Promise<void> {
  const isPlatformAdmin = !!req.user?.isPlatformAdmin;
  const tenantId = isPlatformAdmin ? undefined : requireTenantId(req);
  const tenantWhere = tenantId ? { tenantId } : {};

  const [
    userCount,
    roleCount,
    programCount,
    beneficiaryCount,
    tenantCount,
    pendingReplacements,
    activeCheckIns,
    beneficiariesByOutcome,
    programsByStatus,
    checkInsLast7Days,
  ] = await Promise.all([
    prisma.user.count({ where: tenantWhere }),
    isPlatformAdmin ? Promise.resolve(0) : prisma.role.count({ where: tenantWhere }),
    prisma.program.count({ where: tenantWhere }),
    prisma.beneficiary.count({ where: tenantWhere }),
    isPlatformAdmin ? prisma.tenant.count() : Promise.resolve(0),
    prisma.replacementRequest.count({ where: { ...tenantWhere, status: "PENDING" } }),
    prisma.fieldCheckIn.count({ where: { ...tenantWhere, checkOutAt: null } }),
    prisma.beneficiary.groupBy({ by: ["outcome"], where: tenantWhere, _count: { _all: true } }),
    prisma.program.groupBy({ by: ["status"], where: tenantWhere, _count: { _all: true } }),
    prisma.fieldCheckIn.findMany({
      where: { ...tenantWhere, checkInAt: { gte: daysAgo(6) } },
      select: { checkInAt: true },
    }),
  ]);

  const series: { day: string; checkIns: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const dayStart = daysAgo(i);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);
    const label = dayStart.toLocaleDateString(undefined, { weekday: "short" });
    const count = checkInsLast7Days.filter((c) => c.checkInAt >= dayStart && c.checkInAt < dayEnd).length;
    series.push({ day: label, checkIns: count });
  }

  // Platform admins see the whole system's online count (tenantId=undefined
  // means "everywhere" to getOnlineUserIds); tenant users only ever see
  // their own tenant's online users — never another tenant's.
  const onlineUserIds = getOnlineUserIds(isPlatformAdmin ? undefined : tenantId ?? null);

  sendResponse(res, 200, "Dashboard summary retrieved successfully", {
    counts: {
      users: userCount,
      roles: roleCount,
      programs: programCount,
      beneficiaries: beneficiaryCount,
      tenants: tenantCount,
      pendingReplacements,
      activeCheckIns,
      onlineUsers: onlineUserIds.length,
    },
    beneficiariesByOutcome: beneficiariesByOutcome.map((g) => ({ outcome: g.outcome, count: g._count._all })),
    programsByStatus: programsByStatus.map((g) => ({ status: g.status, count: g._count._all })),
    checkInSeries: series,
  });
}

// Powers the "who's online" modal — the actual names behind the count,
// tenant-scoped exactly like the count itself.
export async function getOnlineUsers(req: Request, res: Response): Promise<void> {
  const isPlatformAdmin = !!req.user?.isPlatformAdmin;
  const tenantId = isPlatformAdmin ? undefined : requireTenantId(req);

  const onlineUserIds = getOnlineUserIds(isPlatformAdmin ? undefined : tenantId ?? null);
  if (onlineUserIds.length === 0) {
    sendResponse(res, 200, "Online users retrieved successfully", []);
    return;
  }

  const users = await prisma.user.findMany({
    where: { id: { in: onlineUserIds } },
    select: {
      id: true,
      name: true,
      firstName: true,
      lastName: true,
      email: true,
      avatarUrl: true,
      role: { select: { name: true } },
      tenant: { select: { name: true } },
    },
  });

  sendResponse(res, 200, "Online users retrieved successfully", users.map(withFullName));
}

const METRICS = ["checkins", "online-users", "beneficiary-attendance"] as const;
const PERIODS = ["week", "month", "year", "lifetime"] as const;

const METRIC_LABELS: Record<(typeof METRICS)[number], { title: (period: string) => string; subtitle: string }> = {
  checkins: {
    title: (period) => `Field check-ins, last ${periodLabel(period)}`,
    subtitle: "Duty-of-care activity across the whole tenant",
  },
  "online-users": {
    title: (period) => `Online users, last ${periodLabel(period)}`,
    subtitle: "How many people were connected at each point in time",
  },
  "beneficiary-attendance": {
    title: (period) => `Beneficiary attendance, last ${periodLabel(period)}`,
    subtitle: "Recorded field visits with an outcome, per respondent",
  },
};

function periodLabel(period: string): string {
  if (period === "week") return "7 days";
  if (period === "month") return "30 days";
  if (period === "year") return "12 months";
  return "all time";
}

function bucketCount<T>(items: T[], getDate: (item: T) => Date, period: string): { label: string; count: number }[] {
  if (period === "week") {
    const buckets: { label: string; count: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const dayStart = daysAgo(i);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);
      buckets.push({
        label: dayStart.toLocaleDateString(undefined, { weekday: "short" }),
        count: items.filter((it) => getDate(it) >= dayStart && getDate(it) < dayEnd).length,
      });
    }
    return buckets;
  }
  if (period === "month") {
    const buckets: { label: string; count: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const dayStart = daysAgo(i);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);
      buckets.push({
        label: dayStart.toLocaleDateString(undefined, { day: "numeric", month: "short" }),
        count: items.filter((it) => getDate(it) >= dayStart && getDate(it) < dayEnd).length,
      });
    }
    return buckets;
  }
  // year / lifetime -> bucket by month
  const monthsBack = period === "year" ? 11 : 23;
  const buckets: { label: string; count: number; start: Date; end: Date }[] = [];
  for (let i = monthsBack; i >= 0; i--) {
    const start = new Date();
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    start.setMonth(start.getMonth() - i);
    const end = new Date(start);
    end.setMonth(end.getMonth() + 1);
    buckets.push({ label: start.toLocaleDateString(undefined, { month: "short", year: "2-digit" }), count: 0, start, end });
  }
  for (const it of items) {
    const d = getDate(it);
    const bucket = buckets.find((b) => d >= b.start && d < b.end);
    if (bucket) bucket.count += 1;
  }
  return buckets.map((b) => ({ label: b.label, count: b.count }));
}

// The configurable chart behind the dashboard's bar/pie selectors: pick a
// metric (checkins / online-users / beneficiary-attendance) and a period
// (week/month/year/lifetime); title and series both come back ready to
// render, no client-side date math required.
export async function getDashboardChart(req: Request, res: Response): Promise<void> {
  const isPlatformAdmin = !!req.user?.isPlatformAdmin;
  const tenantId = isPlatformAdmin ? undefined : requireTenantId(req);
  const tenantWhere = tenantId ? { tenantId } : {};

  const metric = METRICS.includes(req.query.metric as any) ? (req.query.metric as (typeof METRICS)[number]) : "checkins";
  const period = PERIODS.includes(req.query.period as any) ? (req.query.period as (typeof PERIODS)[number]) : "week";

  const since = startOfPeriodsAgo(period, period === "week" ? 1 : period === "month" ? 1 : period === "year" ? 1 : 100);

  let series: { label: string; count: number }[];

  if (metric === "checkins") {
    const rows = await prisma.fieldCheckIn.findMany({ where: { ...tenantWhere, checkInAt: { gte: since } }, select: { checkInAt: true } });
    series = bucketCount(rows, (r) => r.checkInAt, period);
  } else if (metric === "beneficiary-attendance") {
    const rows = await prisma.fieldVisit.findMany({
      where: { recordedAt: { gte: since }, fieldcheckin: tenantId ? { tenantId } : undefined },
      select: { recordedAt: true },
    });
    series = bucketCount(rows, (r) => r.recordedAt, period);
  } else {
    // "online-users" has no historical log today (presence is live-only) —
    // report the current snapshot as a flat series rather than fabricate
    // history that was never recorded.
    const onlineUserIds = (await import("../realtime/socket.js")).getOnlineUserIds(isPlatformAdmin ? undefined : tenantId ?? null);
    series = [{ label: "Right now", count: onlineUserIds.length }];
  }

  const labels = METRIC_LABELS[metric];
  sendResponse(res, 200, "Dashboard chart retrieved successfully", {
    metric,
    period,
    title: labels.title(period),
    subtitle: labels.subtitle,
    series,
  });
}

import type { Request, Response } from "express";
import { requireTenantId } from "../middleware/auth.js";
import { sendResponse } from "../utils/apiResponse.js";
import { prisma } from "../utils/prisma.js";
import { getOnlineUserIds } from "../realtime/socket.js";

function daysAgo(n: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - n);
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

  // Bucket check-ins into a 7-day series the frontend can chart directly.
  const series: { day: string; checkIns: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const dayStart = daysAgo(i);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);
    const label = dayStart.toLocaleDateString(undefined, { weekday: "short" });
    const count = checkInsLast7Days.filter((c) => c.checkInAt >= dayStart && c.checkInAt < dayEnd).length;
    series.push({ day: label, checkIns: count });
  }

  sendResponse(res, 200, "Dashboard summary retrieved successfully", {
    counts: {
      users: userCount,
      roles: roleCount,
      programs: programCount,
      beneficiaries: beneficiaryCount,
      tenants: tenantCount,
      pendingReplacements,
      activeCheckIns,
      onlineUsers: getOnlineUserIds().length,
    },
    beneficiariesByOutcome: beneficiariesByOutcome.map((g) => ({ outcome: g.outcome, count: g._count._all })),
    programsByStatus: programsByStatus.map((g) => ({ status: g.status, count: g._count._all })),
    checkInSeries: series,
  });
}

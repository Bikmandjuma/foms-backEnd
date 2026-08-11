import type { Request, Response } from "express";
import { requireTenantId } from "../middleware/auth.js";
import { ApiError } from "../middleware/errorHandler.js";
import { sendResponse } from "../utils/apiResponse.js";
import { prisma } from "../utils/prisma.js";
import {
  assignAvailabilityChecksSchema,
  submitAvailabilityCheckSchema,
  updateAvailabilityCheckConfigSchema,
} from "../utils/validators.js";
import { recordActivity } from "../utils/activityLog.js";
import { notifyUser } from "../utils/notifications.js";
import { shuffle } from "../utils/geo.js";

const checkerBrief = { select: { id: true, name: true, email: true } } as const;

const programSelect = {
  id: true,
  name: true,
  checkerRoleId: true,
  checkerRole: { select: { id: true, name: true } },
} as const;

/**
 * Round-robins `items` across `userIds` with no cap — kept local rather
 * than shared, this is the same tiny distribution shape used elsewhere
 * (beneficiaryAssignmentController) but this feature is deliberately
 * independent of that one.
 */
function roundRobinAssign<T>(items: T[], userIds: string[]): Map<string, T[]> {
  const buckets = new Map<string, T[]>(userIds.map((id) => [id, [] as T[]]));
  items.forEach((item, i) => {
    const uid = userIds[i % userIds.length]!;
    buckets.get(uid)!.push(item);
  });
  return buckets;
}

function idParam(req: Request): string {
  return req.params.id as string;
}

async function loadProgramOrThrow(programId: string, tenantId: string) {
  const program = await prisma.program.findFirst({ where: { id: programId, tenantId }, select: programSelect });
  if (!program) throw new ApiError(400, "programId does not belong to your tenant");
  return program;
}

/**
 * GET /availability-checks?programId= — the program's saved checker-role
 * config plus every respondent enrolled in the program, each with its
 * current check (if any). This is independent of ProgramAssignment /
 * BeneficiaryAssignment — a respondent shows up here purely because it's
 * enrolled in the program, regardless of caseworker/enumerator status.
 */
export async function getAvailabilityChecks(req: Request, res: Response): Promise<void> {
  const tenantId = requireTenantId(req);
  const { programId } = req.query;
  if (typeof programId !== "string" || !programId) {
    throw new ApiError(400, "programId query parameter is required");
  }

  const program = await prisma.program.findFirst({ where: { id: programId, tenantId }, select: programSelect });
  if (!program) throw new ApiError(404, "Program not found");

  const respondents = await prisma.beneficiary.findMany({
    where: { tenantId, programs: { some: { id: programId } } },
    select: {
      id: true,
      code: true,
      name: true,
      telephone: true,
      district: { select: { name: true } },
      sector: { select: { name: true } },
      cell: { select: { name: true } },
      availabilityChecks: { where: { programId }, take: 1, select: { id: true, status: true, user: checkerBrief } },
    },
    orderBy: { name: "asc" },
  });

  sendResponse(res, 200, "Availability checks retrieved successfully", { program, respondents });
}

/** Save/update which role does the checking for this program — can be changed anytime. */
export async function updateAvailabilityCheckConfig(req: Request, res: Response): Promise<void> {
  const data = updateAvailabilityCheckConfigSchema.parse(req.body);
  const tenantId = requireTenantId(req);

  const program = await loadProgramOrThrow(data.programId, tenantId);
  const role = await prisma.role.findFirst({ where: { id: data.checkerRoleId, tenantId } });
  if (!role) throw new ApiError(400, "checkerRoleId does not belong to your tenant");

  await prisma.program.update({ where: { id: program.id }, data: { checkerRoleId: data.checkerRoleId } });

  await recordActivity({
    tenantId,
    userId: req.user!.sub,
    action: "configured availability checker for",
    entityType: "Program",
    entityId: program.id,
    metadata: { program: program.name, checkerRole: role.name },
  });

  const updated = await prisma.program.findUnique({ where: { id: program.id }, select: programSelect });
  sendResponse(res, 200, "Checker configuration saved successfully", updated);
}

/**
 * Hands every respondent in the program that doesn't already have a check
 * to an active user holding the configured checker role, split evenly
 * round-robin. Every new row starts PENDING — deciding AVAILABLE /
 * NOT_AVAILABLE is a separate, later workflow. Top-up only: respondents
 * that already have a check (from an earlier run) are left untouched, so
 * re-running this after new respondents enroll only covers the new ones.
 */
export async function assignAvailabilityChecks(req: Request, res: Response): Promise<void> {
  const data = assignAvailabilityChecksSchema.parse(req.body);
  const tenantId = requireTenantId(req);

  const program = await loadProgramOrThrow(data.programId, tenantId);
  if (!program.checkerRoleId) throw new ApiError(422, "Configure a checker role for this program first");

  const checkers = await prisma.user.findMany({
    where: { tenantId, roleId: program.checkerRoleId, status: "ACTIVE" },
    select: { id: true, name: true, email: true },
  });
  if (checkers.length === 0) {
    throw new ApiError(422, `No active users hold the "${program.checkerRole?.name}" role yet.`);
  }
  const checkerIds = checkers.map((c) => c.id);

  const candidates = await prisma.beneficiary.findMany({
    where: {
      tenantId,
      programs: { some: { id: program.id } },
      availabilityChecks: { none: { programId: program.id } },
    },
    select: { id: true, code: true, name: true },
  });
  const totalCandidates = candidates.length;

  const buckets = roundRobinAssign(shuffle(candidates), checkerIds);
  const createdRows: { userId: string; beneficiaryId: string }[] = [];
  const perChecker = new Map<string, number>();
  for (const [userId, items] of buckets) {
    if (items.length === 0) continue;
    perChecker.set(userId, items.length);
    for (const b of items) createdRows.push({ userId, beneficiaryId: b.id });
  }

  if (createdRows.length > 0) {
    await prisma.$transaction(
      createdRows.map((row) =>
        prisma.availabilityCheck.create({
          data: { programId: program.id, beneficiaryId: row.beneficiaryId, userId: row.userId, tenantId },
        })
      )
    );
  }

  await recordActivity({
    tenantId,
    userId: req.user!.sub,
    action: "assigned availability checks for",
    entityType: "Program",
    entityId: program.id,
    metadata: { program: program.name, totalAssigned: createdRows.length },
  });

  await Promise.all(
    checkers
      .filter((c) => perChecker.has(c.id))
      .map((c) =>
        notifyUser({
          tenantId,
          userId: c.id,
          type: "ASSIGNMENT_BENEFICIARY",
          message: `You've been assigned ${perChecker.get(c.id)} respondent(s) to confirm availability for "${program.name}"`,
          entityType: "Program",
          entityId: program.id,
        })
      )
  );

  sendResponse(res, 201, `Assigned ${createdRows.length} of ${totalCandidates} respondent(s)`, {
    program: { id: program.id, name: program.name },
    checkers: checkers.map((c) => ({ id: c.id, name: c.name ?? c.email })),
    totalCandidates,
    totalAssigned: createdRows.length,
  });
}

const beneficiaryBrief = {
  select: {
    id: true,
    code: true,
    name: true,
    telephone: true,
    programs: { select: { id: true, name: true } },
  },
} as const;

/**
 * GET /availability-checks/next — the checker's own daily loop, mirroring
 * the field-checkin roster's self-service shape: no admin permission gate,
 * scoped entirely to the caller. Returns their oldest still-PENDING check
 * (if any) plus how many are left, so the mobile app can work through them
 * one at a time.
 */
export async function getNextAvailabilityCheck(req: Request, res: Response): Promise<void> {
  const tenantId = requireTenantId(req);
  const userId = req.user!.sub;

  const [check, remaining] = await Promise.all([
    prisma.availabilityCheck.findFirst({
      where: { tenantId, userId, status: "PENDING" },
      orderBy: { assignedAt: "asc" },
      select: { id: true, status: true, beneficiary: beneficiaryBrief },
    }),
    prisma.availabilityCheck.count({ where: { tenantId, userId, status: "PENDING" } }),
  ]);

  sendResponse(res, 200, "Next availability check retrieved successfully", { check, remaining });
}

/**
 * PUT /availability-checks/:id — the checker submits their finding for one
 * respondent. Self-service, ownership-scoped exactly like
 * fieldCheckInController's recordVisitOutcome (own checks only, unless
 * platform admin).
 */
export async function submitAvailabilityCheck(req: Request, res: Response): Promise<void> {
  const data = submitAvailabilityCheckSchema.parse(req.body);
  const tenantId = requireTenantId(req);

  const check = await prisma.availabilityCheck.findFirst({
    where: { id: idParam(req), tenantId },
    include: { beneficiary: { select: { id: true, name: true } }, program: { select: { id: true, name: true } } },
  });
  if (!check) throw new ApiError(404, "Availability check not found");
  if (check.userId !== req.user!.sub && !req.user!.isPlatformAdmin) {
    throw new ApiError(403, "You can only submit your own availability checks");
  }

  const updated = await prisma.availabilityCheck.update({
    where: { id: check.id },
    data: { status: data.status, notes: data.notes, checkedAt: new Date() },
  });

  await recordActivity({
    tenantId,
    userId: req.user!.sub,
    action: "confirmed availability for",
    entityType: "AvailabilityCheck",
    entityId: check.id,
    metadata: { beneficiary: check.beneficiary.name, program: check.program.name, status: data.status },
  });

  sendResponse(res, 200, "Availability check submitted successfully", updated);
}

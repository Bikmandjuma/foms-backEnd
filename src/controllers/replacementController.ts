import type { Request, Response } from "express";
import { z } from "zod";
import { requireTenantId } from "../middleware/auth.js";
import { ApiError } from "../middleware/errorHandler.js";
import { sendResponse } from "../utils/apiResponse.js";
import { prisma } from "../utils/prisma.js";
import { recordActivity } from "../utils/activityLog.js";
import { notifyUser } from "../utils/notifications.js";
import { computeMatchLevel, matchLevelLabel, shuffle, type GeoLocation } from "../utils/geo.js";
import type { GeoMatchLevel } from "../generated/prisma/enums.js";

const include = {
  originalRespondent: { select: { id: true, name: true, code: true } },
  candidateRespondent: { select: { id: true, name: true, code: true } },
  requestedBy: { select: { id: true, name: true, email: true } },
  decidedBy: { select: { id: true, name: true, email: true } },
} as const;

const createSchema = z.object({
  originalRespondentId: z.string().uuid(),
  reason: z.string().min(1, "Reason is required"),
});

function idParam(req: Request): string {
  return req.params.id as string;
}

/**
 * Searches outward through the geographic hierarchy — village, then cell,
 * then sector, then district, then province — for candidates that share
 * that tier with the original respondent. Stops at the FIRST tier that has
 * at least one candidate and picks ONE AT RANDOM from that tier (never just
 * "the first one found" — if three respondents share a village, each has an
 * equal chance). If nothing matches anywhere, including province, a random
 * candidate is chosen from everyone else eligible in the tenant — a
 * candidate is always found if one exists at all, geography is a
 * preference, not a hard requirement.
 */
function pickCandidate(
  original: GeoLocation,
  pool: ({ id: string; code: string; name: string } & GeoLocation)[]
): { candidate: (typeof pool)[number]; matchLevel: GeoMatchLevel | null } | null {
  if (pool.length === 0) return null;

  const tiers: GeoMatchLevel[] = ["VILLAGE", "CELL", "SECTOR", "DISTRICT", "PROVINCE"];
  for (const tier of tiers) {
    const atThisTier = pool.filter((candidate) => computeMatchLevel(original, candidate) === tier);
    if (atThisTier.length > 0) {
      return { candidate: shuffle(atThisTier)[0]!, matchLevel: tier };
    }
  }

  // No geographic overlap anywhere — fall back to a random other respondent
  // rather than leaving the request unresolved.
  return { candidate: shuffle(pool)[0]!, matchLevel: null };
}

export async function listReplacementRequests(req: Request, res: Response): Promise<void> {
  const tenantId = requireTenantId(req);
  const { status } = req.query;
  const requests = await prisma.replacementRequest.findMany({
    where: {
      tenantId,
      ...(status === "PENDING" || status === "APPROVED" || status === "REJECTED" ? { status } : {}),
    },
    include,
    orderBy: { createdAt: "desc" },
  });
  sendResponse(res, 200, "Replacement requests retrieved successfully", requests);
}

/**
 * Raise a replacement request for a respondent who can't be reached. Fully
 * automatic per spec: no approval step, no manual candidate suggestion from
 * the caller — the system searches the geographic hierarchy immediately,
 * picks a candidate, and finalizes the replacement in the same request.
 */
export async function createReplacementRequest(req: Request, res: Response): Promise<void> {
  const data = createSchema.parse(req.body);
  const tenantId = requireTenantId(req);

  const original = await prisma.beneficiary.findFirst({ where: { id: data.originalRespondentId, tenantId } });
  if (!original) throw new ApiError(400, "originalRespondentId does not belong to your tenant");
  if (original.outcome === "REPLACED") {
    throw new ApiError(409, "This respondent has already been replaced.");
  }

  // Never suggest someone already lined up as another request's candidate,
  // and never the original respondent themself.
  const alreadyCandidateIds = (
    await prisma.replacementRequest.findMany({
      where: { tenantId, candidateRespondentId: { not: null } },
      select: { candidateRespondentId: true },
    })
  ).map((r) => r.candidateRespondentId!);

  const pool = await prisma.beneficiary.findMany({
    where: {
      tenantId,
      id: { notIn: [original.id, ...alreadyCandidateIds] },
      outcome: { not: "REPLACED" },
      assignments: { none: { status: "ACTIVE" } },
    },
    select: { id: true, code: true, name: true, province: true, district: true, sector: true, cell: true, village: true },
    take: 1000,
  });

  const picked = pickCandidate(original, pool);

  const request = await prisma.replacementRequest.create({
    data: {
      reason: data.reason,
      tenantId,
      originalRespondentId: original.id,
      candidateRespondentId: picked?.candidate.id,
      requestedByUserId: req.user!.sub,
      status: picked ? "APPROVED" : "PENDING",
      decidedAt: picked ? new Date() : null,
      matchLevel: picked?.matchLevel ?? null,
    },
    include,
  });

  if (picked) {
    await prisma.beneficiary.update({ where: { id: original.id }, data: { outcome: "REPLACED" } });
  }

  await recordActivity({
    tenantId,
    userId: req.user!.sub,
    action: picked ? "auto-replaced" : "created",
    entityType: "ReplacementRequest",
    entityId: request.id,
    metadata: picked
      ? {
          originalRespondent: original.name,
          candidate: picked.candidate.name,
          matchLevel: picked.matchLevel ?? "OVERRIDE",
        }
      : { originalRespondent: original.name },
  });

  await notifyUser({
    tenantId,
    userId: req.user!.sub,
    type: "REPLACEMENT_DECIDED",
    message: picked
      ? `${original.name} was automatically replaced with ${picked.candidate.name} (${picked.candidate.code}) — ${matchLevelLabel(picked.matchLevel)}`
      : `No other respondent is available yet to replace ${original.name}. This will resolve once one is.`,
    entityType: "ReplacementRequest",
    entityId: request.id,
  });

  sendResponse(
    res,
    201,
    picked ? "Replacement found and applied automatically" : "No eligible respondent is available yet — this request is queued",
    request
  );
}

/**
 * Manual fallback — only reachable for the rare case where NO other
 * respondent existed anywhere in the tenant at request time. Re-runs the
 * same automatic search; still requires no human "approval" judgment call,
 * it's just retrying now that more respondents may exist.
 */
export async function retryReplacementRequest(req: Request, res: Response): Promise<void> {
  const tenantId = requireTenantId(req);

  const existing = await prisma.replacementRequest.findFirst({
    where: { id: idParam(req), tenantId },
    include: { originalRespondent: true },
  });
  if (!existing) throw new ApiError(404, "Replacement request not found");
  if (existing.status !== "PENDING") throw new ApiError(409, "This request has already been resolved");

  const alreadyCandidateIds = (
    await prisma.replacementRequest.findMany({
      where: { tenantId, candidateRespondentId: { not: null } },
      select: { candidateRespondentId: true },
    })
  ).map((r) => r.candidateRespondentId!);

  const pool = await prisma.beneficiary.findMany({
    where: {
      tenantId,
      id: { notIn: [existing.originalRespondentId, ...alreadyCandidateIds] },
      outcome: { not: "REPLACED" },
      assignments: { none: { status: "ACTIVE" } },
    },
    select: { id: true, code: true, name: true, province: true, district: true, sector: true, cell: true, village: true },
    take: 1000,
  });

  const picked = pickCandidate(existing.originalRespondent, pool);
  if (!picked) throw new ApiError(409, "Still no eligible respondent is available to replace this one.");

  const request = await prisma.replacementRequest.update({
    where: { id: existing.id },
    data: {
      status: "APPROVED",
      decidedAt: new Date(),
      candidateRespondentId: picked.candidate.id,
      matchLevel: picked.matchLevel,
    },
    include,
  });

  await prisma.beneficiary.update({ where: { id: existing.originalRespondentId }, data: { outcome: "REPLACED" } });

  await recordActivity({
    tenantId,
    userId: req.user!.sub,
    action: "auto-replaced",
    entityType: "ReplacementRequest",
    entityId: request.id,
    metadata: { matchLevel: picked.matchLevel ?? "OVERRIDE" },
  });

  await notifyUser({
    tenantId,
    userId: request.requestedByUserId,
    type: "REPLACEMENT_DECIDED",
    message: `${existing.originalRespondent.name} has now been replaced with ${picked.candidate.name} (${picked.candidate.code})`,
    entityType: "ReplacementRequest",
    entityId: request.id,
  });

  sendResponse(res, 200, "Replacement resolved successfully", request);
}

export async function deleteReplacementRequest(req: Request, res: Response): Promise<void> {
  const tenantId = requireTenantId(req);
  const existing = await prisma.replacementRequest.findFirst({ where: { id: idParam(req), tenantId } });
  if (!existing) throw new ApiError(404, "Replacement request not found");

  await prisma.replacementRequest.delete({ where: { id: existing.id } });
  sendResponse(res, 200, "Replacement request deleted successfully", null);
}

import type { Request, Response } from "express";
import { requireTenantId } from "../middleware/auth.js";
import { ApiError } from "../middleware/errorHandler.js";
import { sendResponse } from "../utils/apiResponse.js";
import { prisma } from "../utils/prisma.js";
import { createBeneficiarySchema, updateBeneficiarySchema } from "../utils/validators.js";
import { recordActivity } from "../utils/activityLog.js";

const beneficiaryInclude = {
  programs: { select: { id: true, name: true } },
} as const;

function idParam(req: Request): string {
  return req.params.id as string;
}

async function generateBeneficiaryCode(tenantId: string): Promise<string> {
  const year = new Date().getFullYear();
  const count = await prisma.beneficiary.count({ where: { tenantId } });
  return `BEN-${year}-${String(count + 1).padStart(5, "0")}`;
}

async function assertProgramsInTenant(programIds: string[], tenantId: string): Promise<void> {
  if (programIds.length === 0) return;
  const count = await prisma.program.count({ where: { id: { in: programIds }, tenantId } });
  if (count !== programIds.length) throw new ApiError(400, "One or more programIds do not belong to your tenant");
}

export async function listBeneficiaries(req: Request, res: Response): Promise<void> {
  const beneficiaries = await prisma.beneficiary.findMany({
    where: { tenantId: requireTenantId(req) },
    include: beneficiaryInclude,
    orderBy: { createdAt: "desc" },
  });
  sendResponse(res, 200, "Beneficiaries retrieved successfully", beneficiaries);
}

export async function getBeneficiary(req: Request, res: Response): Promise<void> {
  const beneficiary = await prisma.beneficiary.findFirst({
    where: { id: idParam(req), tenantId: requireTenantId(req) },
    include: beneficiaryInclude,
  });
  if (!beneficiary) throw new ApiError(404, "Beneficiary not found");
  sendResponse(res, 200, "Beneficiary retrieved successfully", beneficiary);
}

export async function createBeneficiary(req: Request, res: Response): Promise<void> {
  const data = createBeneficiarySchema.parse(req.body);
  const tenantId = requireTenantId(req);
  const { programIds, ...rest } = data;

  if (programIds) await assertProgramsInTenant(programIds, tenantId);

  const code = await generateBeneficiaryCode(tenantId);

  const beneficiary = await prisma.beneficiary.create({
    data: {
      ...rest,
      code,
      tenantId,
      programs: programIds ? { connect: programIds.map((id) => ({ id })) } : undefined,
    },
    include: beneficiaryInclude,
  });

  await recordActivity({
    tenantId,
    userId: req.user!.sub,
    action: "created",
    entityType: "Beneficiary",
    entityId: beneficiary.id,
    metadata: { code: beneficiary.code, name: beneficiary.name },
  });

  sendResponse(res, 201, "Beneficiary created successfully", beneficiary);
}

export async function updateBeneficiary(req: Request, res: Response): Promise<void> {
  const data = updateBeneficiarySchema.parse(req.body);
  const tenantId = requireTenantId(req);
  const { programIds, ...rest } = data;

  const existing = await prisma.beneficiary.findFirst({ where: { id: idParam(req), tenantId } });
  if (!existing) throw new ApiError(404, "Beneficiary not found");

  if (programIds) await assertProgramsInTenant(programIds, tenantId);

  const beneficiary = await prisma.beneficiary.update({
    where: { id: existing.id },
    data: {
      ...rest,
      programs: programIds ? { set: programIds.map((id) => ({ id })) } : undefined,
    },
    include: beneficiaryInclude,
  });

  await recordActivity({
    tenantId,
    userId: req.user!.sub,
    action: "updated",
    entityType: "Beneficiary",
    entityId: beneficiary.id,
  });

  sendResponse(res, 200, "Beneficiary updated successfully", beneficiary);
}

export async function deleteBeneficiary(req: Request, res: Response): Promise<void> {
  const tenantId = requireTenantId(req);
  const existing = await prisma.beneficiary.findFirst({
    where: { id: idParam(req), tenantId },
  });
  if (!existing) throw new ApiError(404, "Beneficiary not found");

  await prisma.beneficiary.delete({ where: { id: existing.id } });

  await recordActivity({
    tenantId,
    userId: req.user!.sub,
    action: "deleted",
    entityType: "Beneficiary",
    entityId: existing.id,
    metadata: { code: existing.code, name: existing.name },
  });

  sendResponse(res, 200, "Beneficiary deleted successfully", null);
}

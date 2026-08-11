import type { Request, Response } from "express";
import { requireTenantId } from "../middleware/auth.js";
import { ApiError } from "../middleware/errorHandler.js";
import { sendResponse } from "../utils/apiResponse.js";
import { prisma } from "../utils/prisma.js";
import { createBeneficiarySchema, updateBeneficiarySchema } from "../utils/validators.js";
import { recordActivity } from "../utils/activityLog.js";
import { buildBeneficiaryTemplateWorkbook, parseBeneficiariesWorkbook } from "../utils/excel.js";

const GENDER_VALUES = new Set(["MALE", "FEMALE", "OTHER"]);
const STATUS_VALUES = new Set(["ACTIVE", "INACTIVE", "SUSPENDED"]);

const beneficiaryInclude = {
  programs: { select: { id: true, name: true } },
  province: { select: { id: true, name: true } },
  district: { select: { id: true, name: true } },
  sector: { select: { id: true, name: true } },
  cell: { select: { id: true, name: true } },
  village: { select: { id: true, name: true } },
  // The respondent's current caseworker, if any — surfaced as an
  // "Enumerator" column on the program detail view.
  assignments: {
    where: { status: "ACTIVE" as const },
    select: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { assignedAt: "desc" as const },
    take: 1,
  },
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

type RawLocation = { province?: string; district?: string; sector?: string; cell?: string; village?: string };
type ResolvedLocation = { provinceId?: number; districtId?: number; sectorId?: number; cellId?: number; villageId?: number };

/**
 * Excel rows carry human-typed place names; resolve them down the real
 * province -> village hierarchy so imports land on the same FKs the
 * cascading-select UI would produce. Returns null if the deepest name given
 * can't be matched under its stated parents.
 */
async function resolveLocationIds(loc: RawLocation): Promise<ResolvedLocation | null> {
  if (loc.village) {
    const village = await prisma.village.findFirst({
      where: {
        name: loc.village,
        cell: {
          ...(loc.cell ? { name: loc.cell } : {}),
          sector: {
            ...(loc.sector ? { name: loc.sector } : {}),
            district: {
              ...(loc.district ? { name: loc.district } : {}),
              ...(loc.province ? { province: { name: loc.province } } : {}),
            },
          },
        },
      },
      select: {
        id: true,
        cellId: true,
        cell: { select: { sectorId: true, sector: { select: { districtId: true, district: { select: { provinceId: true } } } } } },
      },
    });
    if (!village) return null;
    return {
      villageId: village.id,
      cellId: village.cellId,
      sectorId: village.cell.sectorId,
      districtId: village.cell.sector.districtId,
      provinceId: village.cell.sector.district.provinceId,
    };
  }
  if (loc.cell) {
    const cell = await prisma.cell.findFirst({
      where: {
        name: loc.cell,
        sector: {
          ...(loc.sector ? { name: loc.sector } : {}),
          district: {
            ...(loc.district ? { name: loc.district } : {}),
            ...(loc.province ? { province: { name: loc.province } } : {}),
          },
        },
      },
      select: { id: true, sectorId: true, sector: { select: { districtId: true, district: { select: { provinceId: true } } } } },
    });
    if (!cell) return null;
    return { cellId: cell.id, sectorId: cell.sectorId, districtId: cell.sector.districtId, provinceId: cell.sector.district.provinceId };
  }
  if (loc.sector) {
    const sector = await prisma.sector.findFirst({
      where: {
        name: loc.sector,
        district: { ...(loc.district ? { name: loc.district } : {}), ...(loc.province ? { province: { name: loc.province } } : {}) },
      },
      select: { id: true, districtId: true, district: { select: { provinceId: true } } },
    });
    if (!sector) return null;
    return { sectorId: sector.id, districtId: sector.districtId, provinceId: sector.district.provinceId };
  }
  if (loc.district) {
    const district = await prisma.district.findFirst({
      where: { name: loc.district, ...(loc.province ? { province: { name: loc.province } } : {}) },
      select: { id: true, provinceId: true },
    });
    if (!district) return null;
    return { districtId: district.id, provinceId: district.provinceId };
  }
  if (loc.province) {
    const province = await prisma.province.findFirst({ where: { name: loc.province }, select: { id: true } });
    if (!province) return null;
    return { provinceId: province.id };
  }
  return {};
}

export async function listBeneficiaries(req: Request, res: Response): Promise<void> {
  const tenantId = requireTenantId(req);
  const { programId, status, outcome, search } = req.query;

  const beneficiaries = await prisma.beneficiary.findMany({
    where: {
      tenantId,
      ...(typeof programId === "string" && programId ? { programs: { some: { id: programId } } } : {}),
      ...(status === "ACTIVE" || status === "INACTIVE" || status === "SUSPENDED" ? { status } : {}),
      ...(typeof outcome === "string" && outcome ? { outcome: outcome as never } : {}),
      ...(typeof search === "string" && search.trim()
        ? {
            OR: [
              { name: { contains: search.trim() } },
              { code: { contains: search.trim() } },
              { telephone: { contains: search.trim() } },
              { village: { name: { contains: search.trim() } } },
              { sector: { name: { contains: search.trim() } } },
            ],
          }
        : {}),
    },
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

export async function downloadBeneficiaryTemplate(_req: Request, res: Response): Promise<void> {
  const buffer = await buildBeneficiaryTemplateWorkbook();
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", 'attachment; filename="beneficiaries-import-template.xlsx"');
  res.send(buffer);
}

/**
 * Bulk-create beneficiaries from an uploaded .xlsx file (PRD: "Add option
 * of using excel file to insert data"). Every row is validated the same way
 * a single create would be; bad rows are skipped and reported individually
 * rather than failing the whole batch.
 */
export async function importBeneficiaries(req: Request, res: Response): Promise<void> {
  const tenantId = requireTenantId(req);
  const file = (req as Request & { file?: Express.Multer.File }).file;
  if (!file) throw new ApiError(400, "Attach an .xlsx file under the 'file' field");

  const rawRows = await parseBeneficiariesWorkbook(file.buffer);
  if (rawRows.length === 0) {
    throw new ApiError(400, "No data rows found in that file. Use the template to check the expected columns.");
  }

  const existingPrograms = await prisma.program.findMany({
    where: { tenantId },
    select: { id: true, name: true },
  });
  const programByName = new Map(existingPrograms.map((p) => [p.name.trim().toLowerCase(), p.id]));

  const startingCount = await prisma.beneficiary.count({ where: { tenantId } });
  const year = new Date().getFullYear();

  const errors: { row: number; message: string }[] = [];
  const toCreate: {
    row: number;
    data: Record<string, unknown>;
    programIds: string[];
    unknownPrograms: string[];
  }[] = [];

  for (const raw of rawRows) {
    if (!raw.name) {
      errors.push({ row: raw.rowNumber, message: "Missing required 'Name'" });
      continue;
    }
    if (raw.gender && !GENDER_VALUES.has(raw.gender.toUpperCase())) {
      errors.push({ row: raw.rowNumber, message: `Unrecognized gender '${raw.gender}'` });
      continue;
    }
    if (raw.status && !STATUS_VALUES.has(raw.status.toUpperCase())) {
      errors.push({ row: raw.rowNumber, message: `Unrecognized status '${raw.status}'` });
      continue;
    }
    let dateOfBirth: Date | undefined;
    if (raw.dateOfBirth) {
      const parsed = new Date(raw.dateOfBirth);
      if (Number.isNaN(parsed.getTime())) {
        errors.push({ row: raw.rowNumber, message: `Unrecognized date of birth '${raw.dateOfBirth}'` });
        continue;
      }
      dateOfBirth = parsed;
    }
    let householdSize: number | undefined;
    if (raw.householdSize) {
      const parsed = Number(raw.householdSize);
      if (!Number.isFinite(parsed) || parsed < 0) {
        errors.push({ row: raw.rowNumber, message: `Invalid household size '${raw.householdSize}'` });
        continue;
      }
      householdSize = Math.trunc(parsed);
    }

    let locationIds: ResolvedLocation = {};
    if (raw.province || raw.district || raw.sector || raw.cell || raw.village) {
      const resolved = await resolveLocationIds({
        province: raw.province,
        district: raw.district,
        sector: raw.sector,
        cell: raw.cell,
        village: raw.village,
      });
      if (!resolved) {
        errors.push({
          row: raw.rowNumber,
          message: `Could not match location '${[raw.province, raw.district, raw.sector, raw.cell, raw.village].filter(Boolean).join(" > ")}' to a known administrative area`,
        });
        continue;
      }
      locationIds = resolved;
    }

    const requestedProgramNames = (raw.programs ?? "")
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    const programIds: string[] = [];
    const unknownPrograms: string[] = [];
    for (const name of requestedProgramNames) {
      const id = programByName.get(name.toLowerCase());
      if (id) programIds.push(id);
      else unknownPrograms.push(name);
    }

    toCreate.push({
      row: raw.rowNumber,
      data: {
        code: `BEN-${year}-${String(startingCount + toCreate.length + 1).padStart(5, "0")}`,
        name: raw.name,
        telephone: raw.telephone,
        ...locationIds,
        gender: raw.gender ? raw.gender.toUpperCase() : undefined,
        dateOfBirth,
        nationalId: raw.nationalId,
        householdSize,
        status: raw.status ? raw.status.toUpperCase() : "ACTIVE",
        tenantId,
      },
      programIds,
      unknownPrograms,
    });
  }

  const created: { id: string; code: string; name: string }[] = [];
  const warnings: { row: number; message: string }[] = [];

  for (const item of toCreate) {
    try {
      const beneficiary = await prisma.beneficiary.create({
        data: {
          ...item.data,
          programs: item.programIds.length ? { connect: item.programIds.map((id) => ({ id })) } : undefined,
        } as never,
        select: { id: true, code: true, name: true },
      });
      created.push(beneficiary);
      if (item.unknownPrograms.length) {
        warnings.push({
          row: item.row,
          message: `Created, but program(s) not found and skipped: ${item.unknownPrograms.join(", ")}`,
        });
      }
    } catch (err) {
      errors.push({ row: item.row, message: err instanceof Error ? err.message : "Could not create this row" });
    }
  }

  await recordActivity({
    tenantId,
    userId: req.user!.sub,
    action: "bulk imported",
    entityType: "Beneficiary",
    metadata: { created: created.length, failed: errors.length, fileName: file.originalname },
  });

  sendResponse(res, 201, `Imported ${created.length} of ${rawRows.length} rows`, {
    createdCount: created.length,
    totalRows: rawRows.length,
    created,
    errors,
    warnings,
  });
}

import bcrypt from "bcryptjs";
import type { Request, Response } from "express";
import { requireTenantId } from "../middleware/auth.js";
import { ApiError } from "../middleware/errorHandler.js";
import { sendResponse } from "../utils/apiResponse.js";
import { prisma } from "../utils/prisma.js";
import { createUserSchema, updateUserSchema, changePasswordSchema } from "../utils/validators.js";
import { recordActivity } from "../utils/activityLog.js";
import { hasAction, parsePermissions } from "../utils/permissions.js";
import { derivePasswordFromPhone } from "../utils/phoneCredential.js";
import { buildUserGroupsTemplateWorkbook, parseUserGroupsWorkbook } from "../utils/excel.js";

const SALT_ROUNDS = 10;

const userSelect = {
  id: true,
  email: true,
  name: true,
  firstName: true,
  lastName: true,
  avatarUrl: true,
  telephone: true,
  groupName: true,
  province: { select: { id: true, name: true } },
  district: { select: { id: true, name: true } },
  sector: { select: { id: true, name: true } },
  cell: { select: { id: true, name: true } },
  village: { select: { id: true, name: true } },
  gender: true,
  dateOfBirth: true,
  status: true,
  educationLevel: true,
  createdAt: true,
  updatedAt: true,
  lastSeenAt: true,
  roleId: true,
  role: { select: { id: true, name: true } },
  tenantId: true,
} as const;

// `name` is kept in sync from firstName+lastName wherever those are the
// fields actually being edited (the new User form), so anywhere in the app
// still displaying the old single `.name` field keeps working unchanged.
function deriveName(data: { name?: string; firstName?: string; lastName?: string }): { name?: string } {
  if (data.firstName !== undefined || data.lastName !== undefined) {
    const combined = [data.firstName, data.lastName].filter(Boolean).join(" ").trim();
    if (combined) return { name: combined };
  }
  return {};
}

function idParam(req: Request): string {
  return req.params.id as string;
}

async function assertRoleInTenant(roleId: string, tenantId: string): Promise<void> {
  const role = await prisma.role.findFirst({ where: { id: roleId, tenantId } });
  if (!role) throw new ApiError(400, "roleId does not belong to your tenant");
}

// Editing your OWN record is allowed without users:manage (see
// requirePermissionOrSelf), but that self-service door must not double as a
// way to hand yourself a new role or flip your own status — only an actual
// manager may change those two fields, on anyone, including themselves.
async function actorHasManagePermission(req: Request): Promise<boolean> {
  if (req.user!.isPlatformAdmin) return true;
  if (!req.user!.roleId) return false;
  const role = await prisma.role.findUnique({ where: { id: req.user!.roleId }, select: { permissions: true } });
  return hasAction(parsePermissions(role?.permissions), "users:edit");
}

export async function listUsers(req: Request, res: Response): Promise<void> {
  const { roleId } = req.query;
  const users = await prisma.user.findMany({
    where: { tenantId: requireTenantId(req), ...(typeof roleId === "string" && roleId ? { roleId } : {}) },
    select: userSelect,
    orderBy: { createdAt: "desc" },
  });
  sendResponse(res, 200, "Users retrieved successfully", users);
}

export async function getUser(req: Request, res: Response): Promise<void> {
  const user = await prisma.user.findFirst({
    where: { id: idParam(req), tenantId: requireTenantId(req) },
    select: userSelect,
  });

  if (!user) throw new ApiError(404, "User not found");
  sendResponse(res, 200, "User retrieved successfully", user);
}

export async function createUser(req: Request, res: Response): Promise<void> {
  const data = createUserSchema.parse(req.body);
  const tenantId = requireTenantId(req);

  await assertRoleInTenant(data.roleId, tenantId);

  // Supervisor, Enumerator, and other field staff sign in with their email
  // and their own phone number as the password (Rwanda's +250 country code
  // stripped, local 07... form restored) rather than a manually-typed one —
  // only used when no password was explicitly supplied.
  const rawPassword = data.password ?? (data.telephone ? derivePasswordFromPhone(data.telephone) : undefined);
  if (!rawPassword) throw new ApiError(400, "Provide a password, or a telephone number to derive one from");
  const password = await bcrypt.hash(rawPassword, SALT_ROUNDS);

  const user = await prisma.user.create({
    data: { ...data, ...deriveName(data), password, tenantId },
    select: userSelect,
  });

  await recordActivity({
    tenantId,
    userId: req.user!.sub,
    action: "created",
    entityType: "User",
    entityId: user.id,
    metadata: { email: user.email },
  });

  sendResponse(res, 201, "User created successfully", user);
}

export async function updateUser(req: Request, res: Response): Promise<void> {
  const data = updateUserSchema.parse(req.body);
  const tenantId = requireTenantId(req);

  const existing = await prisma.user.findFirst({ where: { id: idParam(req), tenantId } });
  if (!existing) throw new ApiError(404, "User not found");

  if ((data.roleId !== undefined || data.status !== undefined) && !(await actorHasManagePermission(req))) {
    throw new ApiError(403, "Only a manager can change role or status");
  }

  if (data.roleId) await assertRoleInTenant(data.roleId, tenantId);

  const { password, ...rest } = data;

  const user = await prisma.user.update({
    where: { id: existing.id },
    data: {
      ...rest,
      ...deriveName(rest),
      ...(password ? { password: await bcrypt.hash(password, SALT_ROUNDS) } : {}),
    },
    select: userSelect,
  });

  await recordActivity({
    tenantId,
    userId: req.user!.sub,
    action: "updated",
    entityType: "User",
    entityId: user.id,
  });

  sendResponse(res, 200, "User updated successfully", user);
}

export async function deleteUser(req: Request, res: Response): Promise<void> {
  const tenantId = requireTenantId(req);
  const existing = await prisma.user.findFirst({
    where: { id: idParam(req), tenantId },
  });
  if (!existing) throw new ApiError(404, "User not found");

  await prisma.user.delete({ where: { id: existing.id } });

  await recordActivity({
    tenantId,
    userId: req.user!.sub,
    action: "deleted",
    entityType: "User",
    entityId: existing.id,
    metadata: { email: existing.email },
  });

  sendResponse(res, 200, "User deleted successfully", null);
}

// Self-service avatar upload — separate from the JSON PATCH endpoint since
// this one carries a multipart file. Always affects the caller's own
// account; there's no "set someone else's avatar" version of this.
export async function uploadMyAvatar(req: Request, res: Response): Promise<void> {
  const file = (req as Request & { file?: Express.Multer.File }).file;
  if (!file) throw new ApiError(400, "No image file was uploaded");

  const avatarUrl = `/uploads/avatars/${file.filename}`;

  const user = await prisma.user.update({
    where: { id: req.user!.sub },
    data: { avatarUrl },
    select: userSelect,
  });

  await recordActivity({
    tenantId: user.tenantId,
    userId: req.user!.sub,
    action: "updated profile photo",
    entityType: "User",
    entityId: user.id,
  });

  sendResponse(res, 200, "Profile photo updated successfully", user);
}

/** Self-service password change — the caller changes their own password
 * from inside their account, proving they know the current one. Distinct
 * from the forgot-password flow, which is for when they don't. */
export async function changeMyPassword(req: Request, res: Response): Promise<void> {
  const data = changePasswordSchema.parse(req.body);
  const user = await prisma.user.findUnique({ where: { id: req.user!.sub } });
  if (!user) throw new ApiError(404, "User not found");

  const matches = await bcrypt.compare(data.currentPassword, user.password);
  if (!matches) throw new ApiError(401, "Current password is incorrect");

  const password = await bcrypt.hash(data.newPassword, SALT_ROUNDS);
  await prisma.user.update({
    where: { id: user.id },
    data: { password, tokenVersion: { increment: 1 } },
  });

  await recordActivity({
    tenantId: user.tenantId,
    userId: user.id,
    action: "changed their password",
    entityType: "User",
    entityId: user.id,
  });

  sendResponse(res, 200, "Password changed successfully", null);
}

// Rwanda's provinces are formally Kigali/East/South/West/North, but the
// group spreadsheet's "Region" column is filled in with the names people
// actually say day to day ("Kigali City", "Eastern Province", ...).
const PROVINCE_ALIASES: Record<string, string> = {
  "kigali city": "kigali",
  kigali: "kigali",
  "eastern province": "east",
  eastern: "east",
  east: "east",
  "southern province": "south",
  southern: "south",
  south: "south",
  "western province": "west",
  western: "west",
  west: "west",
  "northern province": "north",
  northern: "north",
  north: "north",
};

export async function downloadUserGroupsTemplate(_req: Request, res: Response): Promise<void> {
  const buffer = await buildUserGroupsTemplateWorkbook();
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", 'attachment; filename="supervisor-enumerator-groups-template.xlsx"');
  res.send(buffer);
}

/**
 * Bulk-creates Supervisor & Enumerator users from the group spreadsheet —
 * one row per person, grouped by the "Group" column, each stating its own
 * Role. Every group can have any number of enumerators under one
 * supervisor, and a file can carry any number of groups. Login is always
 * email + a password derived from that row's own phone number (never
 * manually set) — see phoneCredential.ts. Bad rows are skipped and
 * reported individually rather than failing the whole file; an email
 * that's already a user in this tenant is skipped as a duplicate, not
 * recreated.
 */
export async function importUserGroups(req: Request, res: Response): Promise<void> {
  const tenantId = requireTenantId(req);
  const file = (req as Request & { file?: Express.Multer.File }).file;
  if (!file) throw new ApiError(400, "Attach an .xlsx file under the 'file' field");

  const rawRows = await parseUserGroupsWorkbook(file.buffer);
  if (rawRows.length === 0) {
    throw new ApiError(400, "No data rows found in that file. Use the template to check the expected columns.");
  }

  const [roles, existingEmails] = await Promise.all([
    prisma.role.findMany({ where: { tenantId }, select: { id: true, name: true } }),
    prisma.user.findMany({ where: { tenantId }, select: { email: true } }).then((rows) => new Set(rows.map((r) => r.email.toLowerCase()))),
  ]);
  const roleByName = new Map(roles.map((r) => [r.name.trim().toLowerCase(), r.id]));

  const errors: { row: number; message: string }[] = [];
  const created: { row: number; email: string; group: string | undefined }[] = [];
  const duplicates: { row: number; email: string }[] = [];
  const seenInFile = new Set<string>();

  for (const raw of rawRows) {
    if (!raw.name || !raw.email || !raw.telephone || !raw.role) {
      errors.push({ row: raw.rowNumber, message: "Missing required Name, Email, Phone number, or Role" });
      continue;
    }
    const email = raw.email.trim().toLowerCase();
    if (existingEmails.has(email) || seenInFile.has(email)) {
      duplicates.push({ row: raw.rowNumber, email });
      continue;
    }

    const roleId = roleByName.get(raw.role.trim().toLowerCase());
    if (!roleId) {
      errors.push({ row: raw.rowNumber, message: `No role named '${raw.role}' exists yet in this tenant — create it first` });
      continue;
    }

    let districtId: number | undefined;
    let provinceId: number | undefined;
    if (raw.district) {
      const provinceName = raw.region ? (PROVINCE_ALIASES[raw.region.trim().toLowerCase()] ?? raw.region.trim().toLowerCase()) : undefined;
      const district = await prisma.district.findFirst({
        where: {
          name: raw.district.trim(),
          ...(provinceName ? { province: { name: provinceName } } : {}),
        },
        select: { id: true, provinceId: true },
      });
      if (!district) {
        errors.push({ row: raw.rowNumber, message: `District '${raw.district}'${raw.region ? ` in region '${raw.region}'` : ""} not found` });
        continue;
      }
      districtId = district.id;
      provinceId = district.provinceId;
    }

    const password = await bcrypt.hash(derivePasswordFromPhone(raw.telephone), SALT_ROUNDS);

    const user = await prisma.user.create({
      data: {
        email,
        password,
        roleId,
        name: raw.name.trim(),
        telephone: raw.telephone.trim(),
        groupCode: raw.groupCode,
        groupName: raw.groupName,
        operationalArea: raw.operationalArea,
        districtId,
        provinceId,
        tenantId,
      },
      select: { id: true, email: true },
    });

    seenInFile.add(email);
    created.push({ row: raw.rowNumber, email: user.email, group: raw.groupName ?? raw.groupCode });
  }

  if (created.length > 0) {
    await recordActivity({
      tenantId,
      userId: req.user!.sub,
      action: "imported a group of",
      entityType: "User",
      metadata: { count: created.length, groups: [...new Set(created.map((c) => c.group).filter(Boolean))] },
    });
  }

  sendResponse(res, 201, `Imported ${created.length} of ${rawRows.length} rows`, {
    createdCount: created.length,
    duplicateCount: duplicates.length,
    errorCount: errors.length,
    created,
    duplicates,
    errors,
  });
}

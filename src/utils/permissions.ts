// Canonical permission catalog for Field Operation MS. Stored per-Role as a
// JSON array (Role.permissions) rather than derived from the role's name —
// this is real, editable, per-tenant access control, not a guess.
export const PERMISSIONS = [
  "users:view",
  "users:manage",
  "roles:view",
  "roles:manage",
  "programs:view",
  "programs:manage",
  "beneficiaries:view",
  "beneficiaries:manage",
  "assignments:view",
  "assignments:manage",
  "replacements:view",
  "replacements:manage",
  "monitoring:view",
  "monitoring:manage",
  "activity:view",
  "tenants:view",
  "tenants:manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const PERMISSION_GROUPS: { label: string; permissions: Permission[] }[] = [
  { label: "Users", permissions: ["users:view", "users:manage"] },
  { label: "Roles", permissions: ["roles:view", "roles:manage"] },
  { label: "Programs", permissions: ["programs:view", "programs:manage"] },
  { label: "Beneficiaries", permissions: ["beneficiaries:view", "beneficiaries:manage"] },
  { label: "Assignments", permissions: ["assignments:view", "assignments:manage"] },
  { label: "Replacement requests", permissions: ["replacements:view", "replacements:manage"] },
  { label: "Field monitoring", permissions: ["monitoring:view", "monitoring:manage"] },
  { label: "Activity logs", permissions: ["activity:view"] },
];

// Seeded onto every tenant's auto-created "admin" role (see
// tenantController.createTenant) so a brand-new tenant admin isn't locked
// out of their own workspace.
export const ALL_TENANT_PERMISSIONS: Permission[] = PERMISSIONS.filter(
  (p) => !p.startsWith("tenants:")
);

export function parsePermissions(value: unknown): Permission[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is Permission => typeof v === "string" && (PERMISSIONS as readonly string[]).includes(v));
}

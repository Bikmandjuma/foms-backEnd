// Canonical permission catalog for Field Operation MS. Stored per-Role as a
// JSON array (Role.permissions) rather than derived from the role's name —
// this is real, editable, per-tenant access control, not a guess.
//
// Each resource now exposes granular actions — view / create / edit / delete
// — rather than a single "manage" catch-all, so a role can (say) let
// someone add beneficiaries without letting them delete any. The legacy
// "resource:manage" strings are still recognized (see hasAction below) so
// roles saved before this change keep working exactly as before until
// they're next edited and re-saved with the new granular set.
export const PERMISSIONS = [
  "users:view",
  "users:create",
  "users:edit",
  "users:delete",
  "users:manage", // legacy — implies create+edit+delete on this resource
  "roles:view",
  "roles:create",
  "roles:edit",
  "roles:delete",
  "roles:manage", // legacy
  "programs:view",
  "programs:create",
  "programs:edit",
  "programs:delete",
  "programs:manage", // legacy
  "beneficiaries:view",
  "beneficiaries:create",
  "beneficiaries:edit",
  "beneficiaries:delete",
  "beneficiaries:manage", // legacy
  "assignments:view",
  "assignments:create",
  "assignments:edit",
  "assignments:delete",
  "assignments:manage", // legacy
  "teams:view",
  "teams:create",
  "teams:edit",
  "teams:delete",
  "replacements:view",
  "replacements:create",
  "replacements:edit",
  "replacements:delete",
  "replacements:manage", // legacy
  "vehicles:view",
  "vehicles:create",
  "vehicles:edit",
  "vehicles:delete",
  "monitoring:view",
  "monitoring:manage",
  "activity:view",
  "tenants:view",
  "tenants:manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const PERMISSION_GROUPS: { label: string; permissions: Permission[] }[] = [
  { label: "Users", permissions: ["users:view", "users:create", "users:edit", "users:delete"] },
  { label: "Roles", permissions: ["roles:view", "roles:create", "roles:edit", "roles:delete"] },
  { label: "Programs", permissions: ["programs:view", "programs:create", "programs:edit", "programs:delete"] },
  {
    label: "Beneficiaries",
    permissions: ["beneficiaries:view", "beneficiaries:create", "beneficiaries:edit", "beneficiaries:delete"],
  },
  { label: "Assignments", permissions: ["assignments:view", "assignments:create", "assignments:edit", "assignments:delete"] },
  { label: "Program teams", permissions: ["teams:view", "teams:create", "teams:edit", "teams:delete"] },
  {
    label: "Replacement requests",
    permissions: ["replacements:view", "replacements:create", "replacements:edit", "replacements:delete"],
  },
  { label: "Vehicles", permissions: ["vehicles:view", "vehicles:create", "vehicles:edit", "vehicles:delete"] },
  // These two don't map cleanly onto create/edit/delete — monitoring is
  // about overriding an in-progress check-out, not CRUD — so they keep the
  // simpler view/manage shape.
  { label: "Field monitoring", permissions: ["monitoring:view", "monitoring:manage"] },
  { label: "Activity logs", permissions: ["activity:view"] },
];

// Seeded onto every tenant's auto-created "admin" role (see
// tenantController.createTenant) so a brand-new tenant admin isn't locked
// out of their own workspace. Uses the new granular set going forward.
export const ALL_TENANT_PERMISSIONS: Permission[] = PERMISSIONS.filter(
  (p) => (!p.startsWith("tenants:") && !p.endsWith(":manage")) || p === "monitoring:manage"
);

export function parsePermissions(value: unknown): Permission[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is Permission => typeof v === "string" && (PERMISSIONS as readonly string[]).includes(v));
}

/**
 * Does this permission set grant `action` (e.g. "users:edit")? A role
 * satisfies it either by holding that exact granular permission, or by
 * still carrying the legacy "resource:manage" superset from before this
 * change — so nothing that worked yesterday silently breaks today.
 */
export function hasAction(permissions: Permission[], action: Permission): boolean {
  if (permissions.includes(action)) return true;
  const [resource, verb] = action.split(":");
  if (verb === "view" || verb === "create" || verb === "edit" || verb === "delete") {
    if (permissions.includes(`${resource}:manage` as Permission)) return true;
  }
  return false;
}

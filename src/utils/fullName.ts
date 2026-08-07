// User.name still exists (kept for backward compatibility) alongside the
// newer firstName/lastName fields. This helper computes a display name
// preferring firstName+lastName when present, falling back to the legacy
// `name` field for any user who hasn't been re-saved since the split.
export function fullName(u: { name?: string | null; firstName?: string | null; lastName?: string | null }): string {
  const combined = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
  return combined || u.name || "";
}

export function withFullName<T extends { name?: string | null; firstName?: string | null; lastName?: string | null }>(
  u: T
): T & { name: string } {
  return { ...u, name: fullName(u) };
}

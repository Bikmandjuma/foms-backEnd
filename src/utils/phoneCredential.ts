/**
 * Derives a login password from a Rwandan phone number for roles that don't
 * pick their own password (Supervisor, Enumerator, and other staff added via
 * the group-import / "Others" flows — never Super Admin or Tenant Admin,
 * which are provisioned through their own separate flows).
 *
 * Normalizes any of the phone formats a person might actually type —
 * "+250788123456", "250788123456", "0788123456" — down to the local
 * "07XXXXXXXX" form used as the password, stripping Rwanda's +250 country
 * code and restoring the leading 0 rather than leaving it truncated.
 */
export function derivePasswordFromPhone(rawPhone: string): string {
  const digits = rawPhone.replace(/\D/g, "");
  let local = digits;
  if (local.startsWith("250") && local.length === 12) {
    local = local.slice(3);
  }
  if (!local.startsWith("0")) {
    local = "0" + local;
  }
  return local;
}

const SMS_API_URL = "https://api.mista.io/sms";

/**
 * Accepts a Rwandan phone number in any common shape (07XXXXXXXX,
 * 250 78..., +250788123456, with or without spaces/dashes) and returns it
 * canonicalized as "+2507XXXXXXXX", or null if it isn't a valid-looking
 * Rwandan mobile number.
 */
export function formatRwandaPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");

  let normalized: string;
  if (digits.length === 10 && digits.startsWith("07")) {
    normalized = `250${digits.slice(1)}`;
  } else if (digits.length === 12 && digits.startsWith("2507")) {
    normalized = digits;
  } else if (digits.length === 9 && digits.startsWith("7")) {
    normalized = `250${digits}`;
  } else {
    return null;
  }

  return /^2507\d{8}$/.test(normalized) ? `+${normalized}` : null;
}

/**
 * Sends a real SMS via the mista.io gateway only when SMS_MODE=live and
 * SMS_API_TOKEN is set; otherwise logs the message to the console instead
 * of sending (and instead of throwing), mirroring sendMail's dev-mode
 * fallback — so OTP flows work end-to-end locally without spending real
 * SMS credit. In dev mode the code itself is also fixed (see otp.ts), so
 * testers never need to read this log at all.
 *
 * `to` must already be formatRwandaPhone-validated by the caller.
 */
export async function sendSms(to: string, message: string): Promise<void> {
  const token = process.env.SMS_API_TOKEN;
  const live = process.env.SMS_MODE === "live";
  if (!live || !token) {
    console.log("=".repeat(60));
    console.log(
      live
        ? `[DEV SMS — no SMS_API_TOKEN configured, printing instead]`
        : `[DEV SMS — SMS_MODE is not "live", printing instead]`
    );
    console.log(`To: ${to}`);
    console.log(message);
    console.log("=".repeat(60));
    return;
  }

  const response = await fetch(SMS_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      recipient: to.replace("+", ""),
      sender_id: process.env.SMS_SENDER_ID ?? "E-Notifier",
      type: "plain",
      message,
    }),
  });

  const json = (await response.json().catch(() => null)) as { status?: string; message?: string } | null;
  if (!response.ok || json?.status !== "success") {
    throw new Error(json?.message || `Failed to send SMS (${response.status})`);
  }
}

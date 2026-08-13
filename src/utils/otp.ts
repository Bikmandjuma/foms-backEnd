export const OTP_TTL_MS = 5 * 60 * 1000;
export const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;

// SMS_MODE=live is required to send real texts (see sendSms in sms.ts); any
// other value (including unset — the default) keeps things in dev mode,
// where every code is this fixed one instead of a real random one, so
// testers can always verify with "123456" without reading server logs.
const DEV_OTP_CODE = "123456";

export function generateSixDigitCode(): string {
  if (process.env.SMS_MODE !== "live") return DEV_OTP_CODE;
  return Math.floor(100000 + Math.random() * 900000).toString();
}

import nodemailer from "nodemailer";

let transporter: ReturnType<typeof nodemailer.createTransport> | null = null;

function getTransporter() {
  if (transporter) return transporter;
  if (!process.env.SMTP_HOST) return null;

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined,
  });
  return transporter;
}

interface SendMailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/**
 * Sends an email if SMTP_HOST is configured; otherwise logs the message to
 * the console instead of throwing, so forgot-password (and anything else
 * that emails someone) still works end-to-end in local development without
 * real SMTP credentials — you just read the code from the terminal instead
 * of your inbox.
 */
export async function sendMail(input: SendMailInput): Promise<void> {
  const t = getTransporter();
  if (!t) {
    console.log("=".repeat(60));
    console.log(`[DEV EMAIL — no SMTP_HOST configured, printing instead]`);
    console.log(`To: ${input.to}`);
    console.log(`Subject: ${input.subject}`);
    console.log(input.text);
    console.log("=".repeat(60));
    return;
  }

  await t.sendMail({
    from: process.env.SMTP_FROM ?? "Field Operation MS <no-reply@fieldops.local>",
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
  });
}

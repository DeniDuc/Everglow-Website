import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { db } from "@/db";
import { loadSettings } from "@/lib/settings";

/**
 * Outgoing email through the business Gmail account (eventseverglow@gmail.com) using an
 * App Password (Google Account → Security → 2-Step Verification → App passwords).
 * Env: GMAIL_APP_PASSWORD, optional SMTP_USER (defaults to the "from" address in settings).
 * Without a password emails are skipped and logged, so the site keeps working.
 */

let transport: Transporter | null = null;

function getTransport(user: string): Transporter | null {
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!pass) return null;
  transport ??= nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user: process.env.SMTP_USER || user, pass: pass.replace(/\s+/g, "") },
  });
  return transport;
}

export type Email = { to: string; subject: string; text: string; html?: string; replyTo?: string };

export async function sendEmail(email: Email): Promise<{ sent: boolean; error?: string }> {
  const { email: cfg } = await loadSettings(db);
  const t = getTransport(cfg.fromAddress);
  if (!t) {
    console.warn(`[email] GMAIL_APP_PASSWORD not set — skipped "${email.subject}" to ${email.to}`);
    return { sent: false, error: "not configured" };
  }
  try {
    await t.sendMail({
      from: { name: cfg.fromName, address: cfg.fromAddress },
      replyTo: email.replyTo ?? cfg.replyTo,
      to: email.to,
      subject: email.subject,
      text: email.text,
      html: email.html,
    });
    return { sent: true };
  } catch (e) {
    console.error("[email] send failed", e);
    return { sent: false, error: e instanceof Error ? e.message : "send failed" };
  }
}

/** Alert the business inbox (new inquiry, new booking, failed payment…). Never throws. */
export async function notifyStaff(subject: string, text: string, replyTo?: string) {
  const { email: cfg } = await loadSettings(db);
  return sendEmail({ to: cfg.staffAlerts, subject: `[Everglow] ${subject}`, text, replyTo });
}

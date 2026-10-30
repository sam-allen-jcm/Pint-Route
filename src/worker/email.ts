// Outgoing email via Resend (https://resend.com). The API key is the
// RESEND_API_KEY secret; the sender is the EMAIL_FROM variable.

import type { Env } from "./env";

interface Email {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export async function sendEmail(env: Env, email: Email): Promise<void> {
  if (!env.RESEND_API_KEY) {
    console.error("RESEND_API_KEY is not set, so this email was not sent:", email.subject, "to", email.to);
    if (env.DEV_LOG_EMAILS === "true") console.log(email.text);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: env.EMAIL_FROM || "Pint Route <noreply@pintroute.com>",
      to: [email.to],
      subject: email.subject,
      html: email.html,
      text: email.text,
    }),
  });
  if (!res.ok) {
    console.error(`Resend error ${res.status}: ${(await res.text()).slice(0, 500)}`);
  }
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function passwordResetEmail(name: string, link: string): Omit<Email, "to"> {
  const safeName = escapeHtml(name);
  return {
    subject: "Reset your Pint Route password",
    text: [
      `Hi ${name},`,
      "",
      "Someone (hopefully you) asked to reset the password for your Pint Route account.",
      "Open this link to choose a new one. It works once and expires in 1 hour:",
      "",
      link,
      "",
      "If you didn't ask for this, you can ignore this email and your password won't change.",
      "",
      "Cheers,",
      "Pint Route",
    ].join("\n"),
    html: `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f4e9d4;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#2a1e16">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:480px;margin:0 auto;background:#fffaf0;border:1px solid #e2d2b5;border-radius:14px">
      <tr><td style="background:#2b1a10;border-radius:14px 14px 0 0;border-bottom:3px solid #c8902f;padding:18px 24px;color:#fbe3b0;font-family:Georgia,serif;font-size:22px;font-weight:bold">🍺 Pint Route</td></tr>
      <tr><td style="padding:24px">
        <p style="margin:0 0 12px">Hi ${safeName},</p>
        <p style="margin:0 0 12px">Someone (hopefully you) asked to reset the password for your Pint Route account.</p>
        <p style="margin:0 0 20px">Tap the button to choose a new one. It works once and expires in <strong>1 hour</strong>.</p>
        <p style="margin:0 0 24px"><a href="${escapeHtml(link)}" style="display:inline-block;background:#e8a33d;color:#3a2208;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:999px">Reset password</a></p>
        <p style="margin:0 0 12px;font-size:13px;color:#7a6656">Or paste this link into your browser:<br><span style="word-break:break-all">${escapeHtml(link)}</span></p>
        <p style="margin:0;font-size:13px;color:#7a6656">If you didn't ask for this, ignore this email and your password won't change.</p>
      </td></tr>
    </table>
  </body>
</html>`,
  };
}

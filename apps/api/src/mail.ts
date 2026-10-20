import type { App as FirebaseApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

export interface MailConfig {
  resendApiKey: string;
  /** e.g. "Fealty <hello@obey.chzsda.com>" */
  from: string;
  /** Where the confirm page lives, e.g. https://app.obey.chzsda.com */
  appUrl: string;
}

/**
 * Sends the verification email through Resend. Firebase still owns the code: we ask it for a link, keep only
 * the one-time oobCode, and point the button at our own confirm page instead of Firebase's.
 */
export function verificationSender(firebase: FirebaseApp, mail: MailConfig) {
  return async (email: string) => {
    const firebaseLink = await getAuth(firebase).generateEmailVerificationLink(email, { url: mail.appUrl });
    const code = new URL(firebaseLink).searchParams.get("oobCode");
    if (!code) throw new Error("Firebase returned a link without an oobCode");
    const link = `${mail.appUrl.replace(/\/$/, "")}/verify-email?oobCode=${encodeURIComponent(code)}`;
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${mail.resendApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: mail.from, to: [email], subject: "Confirm your email", html: verificationHtml(link), text: verificationText(link) }),
    });
    if (!res.ok) throw new Error(`Resend answered ${res.status}: ${await res.text()}`);
  };
}

export function verificationText(link: string): string {
  return `Confirm your email\n\nOpen this link to confirm the address you signed up to Fealty with:\n${link}\n\nThe link works once and expires after a while. If you didn't sign up, ignore this email and nothing happens.\n`;
}

/** Table layout and inline styles, because that's what email clients render reliably. Colours follow the app's theme. */
export function verificationHtml(link: string): string {
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>Confirm your email</title></head>
<body style="margin:0;padding:0;background:#fff0f3;font-family:Roboto,'Segoe UI',Helvetica,Arial,sans-serif;color:#22191c;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fff0f3;padding:32px 16px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#fff8f8;border-radius:24px;padding:40px 32px;">
<tr><td>
<div style="width:56px;height:56px;border-radius:16px;background:#ffd9e2;color:#3e001d;font-size:28px;line-height:56px;text-align:center;">&#9993;</div>
<h1 style="margin:24px 0 8px;font-size:28px;line-height:36px;font-weight:400;">Confirm your email</h1>
<p style="margin:0 0 32px;font-size:16px;line-height:24px;color:#514347;">Tap the button to confirm this is your address. Then you're all set to use Fealty.</p>
<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:100px;background:#8b4a62;">
<a href="${link}" style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:500;color:#ffffff;text-decoration:none;border-radius:100px;">Confirm email</a>
</td></tr></table>
<p style="margin:32px 0 0;font-size:13px;line-height:20px;color:#837377;">If the button doesn't work, paste this into your browser:<br><a href="${link}" style="color:#8b4a62;word-break:break-all;">${link}</a></p>
<p style="margin:24px 0 0;font-size:13px;line-height:20px;color:#837377;">Didn't sign up? Ignore this email and nothing happens.</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

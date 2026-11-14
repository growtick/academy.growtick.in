import { RESEND_API_KEY, RESEND_FROM } from 'astro:env/server';

const BASE_URL = import.meta.env.PUBLIC_SITE_URL ?? 'http://localhost:4321';

export interface EmailResult {
  ok: boolean;
  id?: string;
  error?: string;
}

/** Send an email through Resend. In dev (no key) it logs to the console
 *  and reports success so the flow keeps working without real accounts. */
export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}): Promise<EmailResult> {
  if (!RESEND_API_KEY) {
    console.log('[resend skipped — no RESEND_API_KEY] to:', to, 'subject:', subject);
    return { ok: true, id: 'dev-skipped' };
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: RESEND_FROM, to, subject, html }),
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `Resend ${res.status}: ${text}` };
    }
    const data = await res.json();
    return { ok: true, id: data.id };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

function wrap(content: string) {
  return `
<!doctype html>
<html lang="en-IN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    body { font-family: Inter, Arial, sans-serif; color: #17131d; background: #fbfaff; margin: 0; padding: 0; }
    .wrap { max-width: 600px; margin: 24px auto; background: #ffffff; border: 1px solid #e9e2ef; border-radius: 20px; overflow: hidden; }
    .head { background: linear-gradient(145deg, #963de0, #45117b); color: #fff; padding: 32px 24px; text-align: center; }
    .head h1 { margin: 0; font-size: 22px; letter-spacing: -0.02em; }
    .body { padding: 24px; }
    .body h2 { margin-top: 0; font-size: 18px; }
    .btn { display: inline-block; margin: 16px 0; padding: 12px 24px; background: #6421a6; color: #fff; border-radius: 999px; text-decoration: none; font-weight: 700; }
    .foot { padding: 16px 24px; font-size: 13px; color: #625c6b; border-top: 1px solid #e9e2ef; text-align: center; }
    .foot a { color: #6421a6; text-decoration: underline; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="head"><h1>Growtick Academy</h1></div>
    <div class="body">${content}</div>
    <div class="foot">
      Growtick Academy · academy.growtick.in<br />
      <a href="${BASE_URL}/verify">Verify a certificate</a> |
      <a href="https://growtick.in">Visit growtick.in</a>
    </div>
  </div>
</body>
</html>`;
}

export function registrationConfirmation({
  to,
  name,
  courseTitle,
  batchWhen,
  batchWhere,
  fee,
  regCode,
  verifyUrl,
}: {
  to: string;
  name: string;
  courseTitle: string;
  batchWhen: string;
  batchWhere: string;
  fee: number;
  regCode: string;
  verifyUrl: string;
}) {
  const html = wrap(`
    <h2>Registered — ${courseTitle}</h2>
    <p>Hi ${name}, you're registered for the offline batch.</p>
    <table style="width:100%; border-collapse: collapse; margin: 16px 0;">
      <tr><td style="padding: 6px 0; color: #625c6b;">Course</td><td style="padding: 6px 0; font-weight: 700;">${courseTitle}</td></tr>
      <tr><td style="padding: 6px 0; color: #625c6b;">When</td><td style="padding: 6px 0;">${batchWhen}</td></tr>
      <tr><td style="padding: 6px 0; color: #625c6b;">Where</td><td style="padding: 6px 0;">${batchWhere}</td></tr>
      <tr><td style="padding: 6px 0; color: #625c6b;">Fee</td><td style="padding: 6px 0; font-weight: 700;">₹${fee}, pay on arrival</td></tr>
      <tr><td style="padding: 6px 0; color: #625c6b;">Registration code</td><td style="padding: 6px 0; font-weight: 700; letter-spacing: 0.06em;">${regCode}</td></tr>
    </table>
    <p>Bring this code (or your phone number) to the venue for check-in. After you're marked present, your Certificate of Appreciation will be generated and emailed to you.</p>
    <p><a href="${verifyUrl}" class="btn">Verify a certificate</a></p>
  `);
  return sendEmail({ to, subject: `Registered — ${courseTitle}`, html });
}

export function certificateIssued({
  to,
  name,
  courseTitle,
  serial,
  verifyUrl,
  pdfLink,
}: {
  to: string;
  name: string;
  courseTitle: string;
  serial: string;
  verifyUrl: string;
  pdfLink: string;
}) {
  const html = wrap(`
    <h2>Your certificate is ready</h2>
    <p>Hi ${name}, you've earned the <strong>${courseTitle}</strong> certificate.</p>
    <table style="width:100%; border-collapse: collapse; margin: 16px 0;">
      <tr><td style="padding: 6px 0; color: #625c6b;">Serial</td><td style="padding: 6px 0; font-weight: 700; letter-spacing: 0.06em;">${serial}</td></tr>
      <tr><td style="padding: 6px 0; color: #625c6b;">Verify</td><td style="padding: 6px 0;"><a href="${verifyUrl}">${verifyUrl}</a></td></tr>
    </table>
    <p><a href="${pdfLink}" class="btn">Download certificate PDF</a></p>
    <p>You can verify this certificate anytime at academy.growtick.in/verify.</p>
  `);
  return sendEmail({ to, subject: `Your ${courseTitle} certificate is ready`, html });
}

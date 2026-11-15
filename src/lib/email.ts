import { RESEND_API_KEY, RESEND_FROM } from 'astro:env/server';
import { serviceDb } from './supabase';
import { SITE_URL as BASE_URL } from './site';

const FROM = RESEND_FROM || 'Growtick Academy <academy@growtick.in>';

export interface EmailResult {
  ok: boolean;
  id?: string;
  error?: string;
}

/** Escape text for safe interpolation into email HTML. */
export function esc(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function logEmail(recipient: string, subject: string, template: string, result: EmailResult) {
  const db = serviceDb();
  if (!db) return;
  try {
    await db.from('academy_email_log').insert({
      recipient,
      subject,
      template,
      status: result.ok ? (result.id === 'dev-skipped' ? 'skipped' : 'sent') : 'failed',
      error: result.ok ? null : (result.error ?? null),
    });
  } catch {}
}

/** Send an email through Resend and record it in academy_email_log. Without a
 *  RESEND_API_KEY (dev) it logs to the console and reports success. */
export async function sendEmail({
  to,
  subject,
  html,
  template = 'generic',
}: {
  to: string;
  subject: string;
  html: string;
  template?: string;
}): Promise<EmailResult> {
  let result: EmailResult;
  if (!RESEND_API_KEY) {
    console.log('[resend skipped — no RESEND_API_KEY] to:', to, 'subject:', subject);
    result = { ok: true, id: 'dev-skipped' };
  } else {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: FROM, to, subject, html }),
      });
      if (!res.ok) {
        result = { ok: false, error: `Resend ${res.status}: ${await res.text()}` };
      } else {
        const data = (await res.json()) as { id?: string };
        result = { ok: true, id: data.id };
      }
    } catch (err) {
      result = { ok: false, error: String(err) };
    }
  }
  await logEmail(to, subject, template, result);
  return result;
}

function wrap(content: string) {
  return `<!doctype html>
<html lang="en-IN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
</head>
<body style="font-family: Inter, Arial, sans-serif; color: #17131d; background: #fbfaff; margin: 0; padding: 0;">
  <div style="max-width: 600px; margin: 24px auto; background: #ffffff; border: 1px solid #e9e2ef; border-radius: 20px; overflow: hidden;">
    <div style="background: #6421a6; background-image: linear-gradient(145deg, #963de0, #45117b); color: #fff; padding: 28px 24px; text-align: center;">
      <h1 style="margin: 0; font-size: 22px; letter-spacing: -0.02em;">Growtick Academy</h1>
    </div>
    <div style="padding: 24px;">${content}</div>
    <div style="padding: 16px 24px; font-size: 13px; color: #625c6b; border-top: 1px solid #e9e2ef; text-align: center;">
      Growtick Academy · academy.growtick.in<br />
      <a style="color: #6421a6;" href="${BASE_URL}/verify">Verify a certificate</a> ·
      <a style="color: #6421a6;" href="https://growtick.in">growtick.in</a> ·
      WhatsApp +91 95130 59059
    </div>
  </div>
</body>
</html>`;
}

const btn = (href: string, label: string) =>
  `<p><a href="${esc(href)}" style="display: inline-block; margin: 12px 0; padding: 12px 24px; background: #6421a6; color: #fff; border-radius: 999px; text-decoration: none; font-weight: 700;">${esc(label)}</a></p>`;

const rows = (pairs: [string, string][]) =>
  `<table style="width:100%; border-collapse: collapse; margin: 16px 0;">${pairs
    .map(
      ([k, v]) =>
        `<tr><td style="padding: 6px 0; color: #625c6b; width: 40%;">${esc(k)}</td><td style="padding: 6px 0; font-weight: 700;">${v}</td></tr>`
    )
    .join('')}</table>`;

export function registrationConfirmation({
  to,
  name,
  courseTitle,
  batchWhen,
  batchWhere,
  fee,
  payOnSpot = true,
  regCode,
}: {
  to: string;
  name: string;
  courseTitle: string;
  batchWhen: string;
  batchWhere: string;
  fee: number;
  payOnSpot?: boolean;
  regCode: string;
}) {
  const feeText = fee > 0 ? `₹${fee}${payOnSpot ? ', pay on arrival' : ''}` : 'Free';
  const html = wrap(`
    <h2 style="margin-top:0; font-size:18px;">You're registered: ${esc(courseTitle)}</h2>
    <p>Hi ${esc(name)}, your seat is booked.</p>
    ${rows([
      ['Course', esc(courseTitle)],
      ['When', esc(batchWhen)],
      ['Where', esc(batchWhere)],
      ['Fee', esc(feeText)],
      ['Registration code', `<span style="letter-spacing: 0.06em;">${esc(regCode)}</span>`],
    ])}
    <p>Show this code (or your mobile number) at the venue for check-in. Once you're marked present, your certificate is generated and emailed to you.</p>
    ${btn(`${BASE_URL}/registered/${encodeURIComponent(regCode)}`, 'View registration')}
  `);
  return sendEmail({ to, subject: `Registered: ${courseTitle}`, html, template: 'registration-confirmation' });
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
    <h2 style="margin-top:0; font-size:18px;">Your certificate is ready</h2>
    <p>Hi ${esc(name)}, congratulations on completing <strong>${esc(courseTitle)}</strong>.</p>
    ${rows([
      ['Serial', `<span style="letter-spacing: 0.06em;">${esc(serial)}</span>`],
      ['Verify', `<a style="color:#6421a6;" href="${esc(verifyUrl)}">${esc(verifyUrl)}</a>`],
    ])}
    ${btn(pdfLink, 'Download certificate (PDF)')}
    <p>Anyone can check this certificate at academy.growtick.in/verify.</p>
  `);
  return sendEmail({ to, subject: `Your ${courseTitle} certificate is ready`, html, template: 'certificate-issued' });
}

export function paymentSubmitted({ to, name, courseTitle, amount, upiRef }: { to: string; name: string; courseTitle: string; amount: number; upiRef: string }) {
  const html = wrap(`
    <h2 style="margin-top:0; font-size:18px;">Payment received for review</h2>
    <p>Hi ${esc(name)}, thanks. We've got your UPI payment details for <strong>${esc(courseTitle)}</strong>.</p>
    ${rows([
      ['Amount', `₹${esc(amount)}`],
      ['UPI reference', esc(upiRef)],
    ])}
    <p>We'll confirm it shortly (usually within a few hours) and email you when your course is unlocked.</p>
    ${btn(`${BASE_URL}/dashboard`, 'Go to my dashboard')}
  `);
  return sendEmail({ to, subject: `Payment received: ${courseTitle}`, html, template: 'payment-submitted' });
}

export function paymentApproved({ to, name, courseTitle, slug }: { to: string; name: string; courseTitle: string; slug: string }) {
  const html = wrap(`
    <h2 style="margin-top:0; font-size:18px;">You're in. Start learning.</h2>
    <p>Hi ${esc(name)}, your payment for <strong>${esc(courseTitle)}</strong> is confirmed and the course is unlocked.</p>
    ${btn(`${BASE_URL}/learn/${encodeURIComponent(slug)}`, 'Start the course')}
  `);
  return sendEmail({ to, subject: `Unlocked: ${courseTitle}`, html, template: 'payment-approved' });
}

export function paymentRejected({ to, name, courseTitle, enrollmentId, reason }: { to: string; name: string; courseTitle: string; enrollmentId: string; reason?: string }) {
  const html = wrap(`
    <h2 style="margin-top:0; font-size:18px;">We couldn't confirm your payment</h2>
    <p>Hi ${esc(name)}, we couldn't match the UPI reference you sent for <strong>${esc(courseTitle)}</strong>.</p>
    ${reason ? `<p><strong>Note from the team:</strong> ${esc(reason)}</p>` : ''}
    <p>Please check the reference number in your UPI app and submit it again, or message us on WhatsApp.</p>
    ${btn(`${BASE_URL}/pay/${encodeURIComponent(enrollmentId)}`, 'Submit payment again')}
  `);
  return sendEmail({ to, subject: `Payment not confirmed: ${courseTitle}`, html, template: 'payment-rejected' });
}

export function liveReminder({
  to,
  name,
  courseTitle,
  when,
  slug,
}: {
  to: string;
  name: string;
  courseTitle: string;
  when: string;
  slug: string;
}) {
  const html = wrap(`
    <h2 style="margin-top:0; font-size:18px;">Live class reminder</h2>
    <p>Hi ${esc(name)}, your live class for <strong>${esc(courseTitle)}</strong> is coming up.</p>
    ${rows([['When', esc(when)]])}
    <p>The join link is on your course page. It opens a few minutes before the class starts.</p>
    ${btn(`${BASE_URL}/learn/${encodeURIComponent(slug)}`, 'Open the course')}
  `);
  return sendEmail({ to, subject: `Reminder: live class for ${courseTitle}`, html, template: 'live-reminder' });
}

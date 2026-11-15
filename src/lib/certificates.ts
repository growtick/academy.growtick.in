import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { SUPABASE_URL } from 'astro:env/server';
import { serviceDb } from './supabase';
import { certificateIssued } from './email';
import { one, many } from './http';
import { SITE_URL } from './site';
import gstTemplate from '../assets/certificates/gst-compliance.jpg?inline';

/** Designed certificate artwork per course. Coordinates are in template pixels
 *  (origin top-left). The artwork already carries the title, course, date and
 *  signatory, so only the name and verification details are overlaid. */
interface CertTemplate {
  dataUrl: string;
  width: number;
  height: number;
  name: { cx: number; baseline: number; maxWidth: number; size: number };
  verify: { x: number; baseline: number };
}
const TEMPLATES: Record<string, CertTemplate> = {
  'gst-compliance': {
    dataUrl: gstTemplate,
    width: 1600,
    height: 1131,
    name: { cx: 800, baseline: 572, maxWidth: 1050, size: 64 },
    verify: { x: 250, baseline: 948 },
  },
};

function dataUrlBytes(url: string): Uint8Array {
  const b64 = url.slice(url.indexOf(',') + 1);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function renderTemplate(t: CertTemplate, f: { name: string; serial: string; verifyCode: string }): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const W = 841.89; // A4 landscape width in points
  const k = W / t.width;
  const H = t.height * k;
  pdfDoc.setTitle(`Growtick Academy certificate ${f.serial}`);
  const page = pdfDoc.addPage([W, H]);
  const isPng = t.dataUrl.startsWith('data:image/png');
  const bytes = dataUrlBytes(t.dataUrl);
  const img = isPng ? await pdfDoc.embedPng(bytes) : await pdfDoc.embedJpg(bytes);
  page.drawImage(img, { x: 0, y: 0, width: W, height: H });

  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const reg = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const name = pdfSafe(f.name).trim() || 'Participant';
  let size = t.name.size * k;
  while (bold.widthOfTextAtSize(name, size) > t.name.maxWidth * k && size > 12) size -= 1;
  page.drawText(name, {
    x: t.name.cx * k - bold.widthOfTextAtSize(name, size) / 2,
    y: H - t.name.baseline * k,
    size,
    font: bold,
    color: rgb(0.345, 0.055, 0.475),
  });

  const site = SITE_URL.replace(/^https?:\/\//, '');
  const lines = [`Serial: ${f.serial}`, `Verify: ${site}/verify  ·  ${f.verifyCode}`];
  lines.forEach((line, i) =>
    page.drawText(pdfSafe(line), { x: t.verify.x * k, y: H - (t.verify.baseline + i * 26) * k, size: 8.5, font: reg, color: MUTED })
  );
  return pdfDoc.save();
}

const BUCKET = 'academy-certificates';

const PURPLE = rgb(0.392, 0.129, 0.651);
const INK = rgb(0.09, 0.075, 0.114);
const MUTED = rgb(0.384, 0.361, 0.42);

/** Public URL of a certificate PDF (bucket is public read). */
export function certificatePublicUrl(path: string | null | undefined) {
  if (!path) return null;
  const host = (SUPABASE_URL ?? '').replace(/\/$/, '');
  return `${host}/storage/v1/object/public/${BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`;
}

export function makeVerifyCode() {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return 'GT-VRF-' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** pdf-lib standard fonts are WinAnsi only; drop characters they can't draw. */
function pdfSafe(s: string) {
  return s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/[^\x20-\x7E\xA0-\xFF]/g, '');
}

/** Render a certificate PDF (A4 landscape, brand colours, text only so it runs on Workers). */
export async function generateCertificatePdf({
  courseSlug,
  name,
  courseTitle,
  kind,
  mode,
  serial,
  verifyCode,
  issuedAt,
  signatory,
}: {
  courseSlug?: string | null;
  name: string;
  courseTitle: string;
  kind: 'appreciation' | 'completion';
  mode: 'offline' | 'online';
  serial: string;
  verifyCode: string;
  issuedAt: string;
  signatory: string;
}): Promise<Uint8Array> {
  const tpl = courseSlug ? TEMPLATES[courseSlug] : undefined;
  if (tpl) return renderTemplate(tpl, { name, serial, verifyCode });

  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(`Growtick Academy certificate ${serial}`);
  const page = pdfDoc.addPage([841.89, 595.28]); // A4 landscape
  const width = page.getWidth();
  const height = page.getHeight();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const center = (text: string, f: typeof font, size: number, y: number, color = INK) => {
    let s = size;
    const t = pdfSafe(text);
    while (f.widthOfTextAtSize(t, s) > width - 140 && s > 10) s -= 1;
    page.drawText(t, { x: (width - f.widthOfTextAtSize(t, s)) / 2, y, size: s, font: f, color });
  };

  page.drawRectangle({ x: 0, y: 0, width, height, color: rgb(0.984, 0.98, 1) });
  page.drawRectangle({ x: 28, y: 28, width: width - 56, height: height - 56, borderColor: PURPLE, borderWidth: 3 });
  page.drawRectangle({ x: 38, y: 38, width: width - 76, height: height - 76, borderColor: rgb(0.945, 0.91, 0.98), borderWidth: 1 });

  const title = kind === 'completion' ? 'Certificate of Completion' : 'Certificate of Appreciation';
  const verb =
    kind === 'completion'
      ? 'has successfully completed the online course'
      : mode === 'online'
        ? 'has participated in the online course'
        : 'has attended and participated in';

  center('GROWTICK ACADEMY', fontBold, 18, height - 92, PURPLE);
  center(title, fontBold, 34, height - 140, INK);
  page.drawLine({ start: { x: width / 2 - 130, y: height - 160 }, end: { x: width / 2 + 130, y: height - 160 }, color: PURPLE, thickness: 1.5 });

  const issued = new Date(issuedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });

  center('This is to certify that', font, 14, height - 210, MUTED);
  center(name, fontBold, 30, height - 254, INK);
  center(verb, font, 14, height - 290, MUTED);
  center(courseTitle, fontBold, 20, height - 324, INK);
  center(`on ${issued}`, font, 13, height - 352, MUTED);

  // signature block (left) + verification (right)
  page.drawLine({ start: { x: 110, y: 120 }, end: { x: 330, y: 120 }, color: PURPLE, thickness: 1 });
  const sig = pdfSafe(signatory);
  page.drawText(sig, { x: 220 - fontBold.widthOfTextAtSize(sig, 13) / 2, y: 102, size: 13, font: fontBold, color: INK });
  const sigRole = 'Growtick Academy';
  page.drawText(sigRole, { x: 220 - font.widthOfTextAtSize(sigRole, 11) / 2, y: 86, size: 11, font, color: MUTED });

  const right = width - 110;
  const lines: [string, typeof font, number][] = [
    [`Serial: ${serial}`, font, 11],
    [`Verification code: ${verifyCode}`, font, 11],
    [`Verify at ${SITE_URL.replace(/^https?:\/\//, '')}/verify`, fontBold, 11],
  ];
  lines.forEach(([t, f, s], i) => {
    page.drawText(t, { x: right - f.widthOfTextAtSize(t, s), y: 120 - i * 17, size: s, font: f, color: i === 2 ? PURPLE : MUTED });
  });

  return pdfDoc.save();
}

const ENROLLMENT_SELECT = `
  id, name, email, mode, status, attended_at, payment_status, course_id, batch_id,
  academy_courses (title, slug, certificate_kind, pass_mark),
  academy_certificates (id, serial, verify_code, pdf_path, issued_at, emailed_at, revoked)
`;

export interface IssueResult {
  ok: true;
  already_issued: boolean;
  serial: string;
  verify_code: string;
  pdf_url: string | null;
  pdf_path: string;
}

/** Issue a certificate for an enrollment: PDF → storage → row → email.
 *  Idempotent: returns the existing certificate if one was already issued.
 *  `resend` re-emails an existing certificate. */
export async function issueCertificate({ enrollmentId, resend = false }: { enrollmentId: string; resend?: boolean }): Promise<IssueResult> {
  const db = serviceDb();
  if (!db) throw new Error('Database is not configured');

  const { data: enrollment, error: e1 } = await db.from('academy_enrollments').select(ENROLLMENT_SELECT).eq('id', enrollmentId).maybeSingle();
  if (e1) throw new Error(`Enrollment lookup failed: ${e1.message}`);
  if (!enrollment) throw new Error('Enrollment not found');

  const course = one<any>(enrollment.academy_courses);
  const courseTitle = course?.title ?? 'Growtick Academy course';
  const existing = one<any>(enrollment.academy_certificates);

  if (existing) {
    if (resend) {
      const r = await certificateIssued({
        to: enrollment.email,
        name: enrollment.name,
        courseTitle,
        serial: existing.serial,
        verifyUrl: `${SITE_URL}/verify?code=${encodeURIComponent(existing.verify_code)}`,
        pdfLink: certificatePublicUrl(existing.pdf_path) ?? `${SITE_URL}/verify`,
      });
      if (r.ok) await db.from('academy_certificates').update({ emailed_at: new Date().toISOString() }).eq('id', existing.id);
    }
    return {
      ok: true,
      already_issued: true,
      serial: existing.serial,
      verify_code: existing.verify_code,
      pdf_url: certificatePublicUrl(existing.pdf_path),
      pdf_path: existing.pdf_path,
    };
  }

  const { data: settings } = await db.from('academy_settings').select('value').eq('key', 'signatory_name').maybeSingle();
  const signatory = settings?.value && !settings.value.startsWith('TODO') ? settings.value : 'Growtick Academy';

  const { data: seqData, error: seqErr } = await db.rpc('academy_next_certificate_serial');
  let seq = Number(seqData);
  if (seqErr || !Number.isFinite(seq) || seq <= 0) {
    // Fallback before migration 0008 is applied.
    const { count } = await db.from('academy_certificates').select('*', { head: true, count: 'exact' });
    seq = (count ?? 0) + 1;
  }
  const prefix = (course?.slug ?? 'crs').split('-')[0].toUpperCase().slice(0, 6);
  const year = new Date().getFullYear();
  const serial = `GT-${prefix}-${year}-${String(seq).padStart(4, '0')}`;
  const verifyCode = makeVerifyCode();
  const issuedAt = new Date().toISOString();
  const filePath = `certificates/${enrollment.id}.pdf`;

  const kind: 'appreciation' | 'completion' = course?.certificate_kind === 'completion' ? 'completion' : 'appreciation';
  const pdf = await generateCertificatePdf({
    courseSlug: course?.slug ?? enrollment.course_id,
    name: enrollment.name,
    courseTitle,
    kind,
    mode: enrollment.mode === 'online' ? 'online' : 'offline',
    serial,
    verifyCode,
    issuedAt,
    signatory,
  });

  const { error: uerr } = await db.storage.from(BUCKET).upload(filePath, pdf, {
    contentType: 'application/pdf',
    upsert: true,
    cacheControl: '3600',
  });
  if (uerr) throw new Error(`Certificate upload failed: ${uerr.message}`);

  const { data: cert, error: ierr } = await db
    .from('academy_certificates')
    .insert({ enrollment_id: enrollment.id, serial, verify_code: verifyCode, pdf_path: filePath, issued_at: issuedAt })
    .select('id')
    .single();
  if (ierr) {
    // Lost a race with a concurrent issue: return the winner.
    if (ierr.code === '23505') return issueCertificate({ enrollmentId });
    throw new Error(`Certificate record failed: ${ierr.message}`);
  }

  if (enrollment.mode === 'online' && enrollment.status !== 'completed') {
    await db.from('academy_enrollments').update({ status: 'completed' }).eq('id', enrollment.id);
  }

  const mail = await certificateIssued({
    to: enrollment.email,
    name: enrollment.name,
    courseTitle,
    serial,
    verifyUrl: `${SITE_URL}/verify?code=${encodeURIComponent(verifyCode)}`,
    pdfLink: certificatePublicUrl(filePath) ?? `${SITE_URL}/verify`,
  });
  if (mail.ok) {
    await db.from('academy_certificates').update({ emailed_at: new Date().toISOString() }).eq('id', cert.id);
  }

  return { ok: true, already_issued: false, serial, verify_code: verifyCode, pdf_url: certificatePublicUrl(filePath), pdf_path: filePath };
}

export interface Eligibility {
  eligible: boolean;
  requiredTotal: number;
  requiredDone: number;
  quizPassed: boolean;
  needsLive: boolean;
  liveAttended: boolean;
  reasons: string[];
}

/** Online certificate rule: every required lesson complete, every required quiz
 *  passed (≥ course pass mark), and the live session attended when the course
 *  has one. */
export async function onlineEligibility(enrollmentId: string): Promise<Eligibility> {
  const db = serviceDb();
  if (!db) throw new Error('Database is not configured');

  const { data: enr } = await db.from('academy_enrollments').select('id, course_id, status, attended_at').eq('id', enrollmentId).maybeSingle();
  if (!enr) throw new Error('Enrollment not found');

  const { data: mods } = await db
    .from('academy_modules')
    .select('id, academy_lessons (id, type, required)')
    .eq('course_id', enr.course_id);
  const lessons = (mods ?? []).flatMap((m: any) => many<any>(m.academy_lessons));
  const required = lessons.filter((l) => l.required);
  const requiredQuizzes = required.filter((l) => l.type === 'quiz');
  const needsLive = required.some((l) => l.type === 'live');

  const { data: progress } = await db.from('academy_lesson_progress').select('lesson_id').eq('enrollment_id', enrollmentId);
  const done = new Set((progress ?? []).map((p: any) => p.lesson_id));

  const { data: attempts } = await db.from('academy_quiz_attempts').select('lesson_id, passed').eq('enrollment_id', enrollmentId).eq('passed', true);
  const passed = new Set((attempts ?? []).map((a: any) => a.lesson_id));

  // live lessons count as done when the learner's live attendance is recorded
  const isDone = (l: any) => (l.type === 'live' ? !!enr.attended_at || done.has(l.id) : l.type === 'quiz' ? passed.has(l.id) : done.has(l.id));
  const requiredDone = required.filter(isDone).length;
  const quizPassed = requiredQuizzes.every((q) => passed.has(q.id));
  const liveAttended = !needsLive || !!enr.attended_at;

  const reasons: string[] = [];
  if (enr.status !== 'active' && enr.status !== 'completed') reasons.push('Enrolment is not active yet');
  if (required.length === 0) reasons.push('Course has no lessons yet');
  if (requiredDone < required.length) reasons.push(`${required.length - requiredDone} required lesson(s) left`);
  if (!quizPassed) reasons.push('Final quiz not passed yet');
  if (!liveAttended) reasons.push('Live session attendance not recorded yet');

  return {
    eligible: reasons.length === 0,
    requiredTotal: required.length,
    requiredDone,
    quizPassed,
    needsLive,
    liveAttended,
    reasons,
  };
}

/** Issue the online certificate automatically when the learner qualifies. */
export async function maybeIssueOnlineCertificate(enrollmentId: string): Promise<IssueResult | null> {
  const el = await onlineEligibility(enrollmentId);
  if (!el.eligible) return null;
  return issueCertificate({ enrollmentId });
}

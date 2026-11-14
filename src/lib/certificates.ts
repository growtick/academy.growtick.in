import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from 'astro:env/server';
import { serviceDb } from './supabase';
import { certificateIssued } from './email';

const BUCKET = 'academy-certificates';
const SITE_URL = import.meta.env.PUBLIC_SITE_URL ?? 'http://localhost:4321';

const PURPLE = rgb(0.42, 0.13, 0.65);
const INK = rgb(0.13, 0.11, 0.17);
const MUTED = rgb(0.45, 0.4, 0.5);

/** Public URL of a certificate PDF (bucket is public read). */
export function certificatePublicUrl(path: string) {
  const host = (SUPABASE_URL ?? '').replace(/\/$/, '');
  return `${host}/storage/v1/object/public/${BUCKET}/${encodeURIComponent(path)}`;
}

export function makeVerifyCode() {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return 'GT-VRF-' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}


/** Render a Certificate of Appreciation PDF (A4, brand colours, text-only so it works on Cloudflare Workers). */
export async function generateCertificatePdf({
  name,
  courseTitle,
  serial,
  verifyCode,
  issuedAt,
  signatory,
}: {
  name: string;
  courseTitle: string;
  serial: string;
  verifyCode: string;
  issuedAt: string;
  signatory: string;
}): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]); // A4
  const width = page.getWidth();
  const height = page.getHeight();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const center = (text: string, f: typeof font, size: number, y: number, color = INK) => {
    const x = (width - f.widthOfTextAtSize(text, size)) / 2;
    page.drawText(text, { x, y, size, font: f, color });
  };

  // Brand background
  page.drawRectangle({ x: 0, y: 0, width, height, color: rgb(0.985, 0.98, 1) });
  // Inner border
  page.drawRectangle({ x: 40, y: 40, width: width - 80, height: height - 80, borderColor: PURPLE, borderWidth: 2.5 });

  center('GROWTICK ACADEMY', fontBold, 22, height - 70, PURPLE);
  center('Certificate of Appreciation', fontBold, 34, height - 115, INK);
  page.drawLine({
    start: { x: width / 2 - 120, y: height - 145 },
    end: { x: width / 2 + 120, y: height - 145 },
    color: PURPLE,
    thickness: 1.5,
  });

  const issued = new Date(issuedAt).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  center('This is to certify that', font, 15, 485, MUTED);
  center(name, fontBold, 26, 450, INK);
  center('has successfully completed the offline course', font, 15, 410, MUTED);
  center(courseTitle, fontBold, 19, 380, INK);
  center(`on ${issued}`, font, 14, 340, MUTED);

  center(`Serial:  ${serial}`, font, 12, 275, MUTED);
  center(`Verify code:  ${verifyCode}`, font, 12, 257, MUTED);

  page.drawLine({ start: { x: width / 2 - 140, y: 210 }, end: { x: width / 2 + 140, y: 210 }, color: PURPLE, thickness: 1 });
  center(signatory, fontBold, 13, 192, INK);
  center('Signatory, Growtick Academy', font, 11, 175, MUTED);

  return pdfDoc.save();
}

/** Issue (or re-issue) a certificate for an enrollment: PDF, storage row, email. */
export async function issueCertificate({ enrollmentId }: { enrollmentId: string }) {
  const db = serviceDb();
  if (!db) throw new Error('Database is not configured');

  const { data: enrollment, error: e1 } = await db
    .from('academy_enrollments')
    .select(`
      id, name, email, phone, reg_code, status, attended_at,
      academy_batches (venue, starts_at),
      academy_courses (title, slug),
      academy_certificates (serial, verify_code, pdf_path, issued_at, emailed_at)
    `)
    .eq('id', enrollmentId)
    .maybeSingle();
  if (e1 || !enrollment) throw new Error('Enrollment not found');

  const existing = enrollment.academy_certificates?.[0];
  if (existing) {
    return {
      ok: true,
      already_issued: true,
      serial: existing.serial,
      verify_code: existing.verify_code,
      pdf_url: certificatePublicUrl(existing.pdf_path),
      pdf_path: existing.pdf_path,
    };
  }

  const { data: settings } = await db.from('academy_settings').select('key, value').eq('key', 'signatory_name').maybeSingle();
  const signatory = settings?.value ?? 'Growtick Academy';

  const { count } = await db.from('academy_certificates').select('*', { head: true, count: 'exact' });
  const seq = (count ?? 0) + 1;
  const prefix = enrollment.academy_courses?.[0]?.slug.split('-')[0]?.toUpperCase() ?? 'CRS';
  const serial = `GT-${prefix}-2026-${String(seq).padStart(4, '0')}`;
  const verifyCode = makeVerifyCode();
  const issuedAt = new Date().toISOString();
  const filePath = `certificates/${enrollment.id}.pdf`;

  const pdf = await generateCertificatePdf({
    name: enrollment.name,
    courseTitle: enrollment.academy_courses?.[0]?.title ?? 'this course',
    serial,
    verifyCode,
    issuedAt,
    signatory,
  });

  const supabase = createClient(SUPABASE_URL ?? '', SUPABASE_SERVICE_ROLE_KEY ?? '', {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: uerr } = await supabase.storage.from(BUCKET).upload(filePath, pdf, {
    contentType: 'application/pdf',
    upsert: true,
    cacheControl: '3600',
  });
  if (uerr) throw new Error(`Certificate upload failed: ${uerr.message}`);

  const { data: cert, error: ierr } = await db
    .from('academy_certificates')
    .insert({ enrollment_id: enrollment.id, serial, verify_code: verifyCode, pdf_path: filePath })
    .select()
    .single();
  if (ierr) throw new Error(`Certificate record failed: ${ierr.message}`);

  // Email the certificate (never blocks the response).
  await certificateIssued({
    to: enrollment.email,
    name: enrollment.name,
    courseTitle: enrollment.academy_courses?.[0]?.title ?? 'this course',
    serial,
    verifyUrl: `${SITE_URL}/verify?code=${encodeURIComponent(verifyCode)}`,
    pdfLink: certificatePublicUrl(filePath),
  }).catch(() => {});

  await db.from('academy_certificates').update({ emailed_at: new Date().toISOString() }).eq('id', cert.id);

  return {
    ok: true,
    already_issued: false,
    serial,
    verify_code: verifyCode,
    pdf_url: certificatePublicUrl(filePath),
    pdf_path: filePath,
  };
}

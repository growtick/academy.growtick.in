import type { APIRoute } from 'astro';
import { serviceDb } from '../../../lib/supabase';
import { json, requireAdmin, one } from '../../../lib/http';
import { toCsv } from '../../../lib/csv';
import { certificatePublicUrl } from '../../../lib/certificates';

export const prerender = false;

// GET /api/admin/export?batch=<uuid>&course=<slug>&mode=offline|online
export const GET: APIRoute = async ({ request, cookies, url }) => {
  if (!(await requireAdmin({ request, cookies }))) return json({ error: 'Admin sign-in required' }, 401);
  const db = serviceDb();
  if (!db) return json({ error: 'Database is not configured' }, 503);

  let q = db
    .from('academy_enrollments')
    .select(
      `reg_code, name, email, phone, mode, status, source, payment_method, payment_status, amount, upi_ref,
       attended_at, created_at, course_id,
       academy_batches (starts_at, venue),
       academy_certificates (serial, verify_code, pdf_path, issued_at, emailed_at, revoked)`
    )
    .order('created_at', { ascending: true });
  const batch = url.searchParams.get('batch');
  const course = url.searchParams.get('course');
  const mode = url.searchParams.get('mode');
  if (batch) q = q.eq('batch_id', batch);
  if (course) q = q.eq('course_id', course);
  if (mode === 'offline' || mode === 'online') q = q.eq('mode', mode);

  const { data, error } = await q;
  if (error) return json({ error: error.message }, 500);

  const ist = (d?: string | null) => (d ? new Date(d).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : '');
  const rows: (string | number | null)[][] = [
    ['Reg code', 'Name', 'Email', 'Phone', 'Course', 'Batch', 'Mode', 'Status', 'Source', 'Payment method', 'Payment status', 'Amount', 'UPI ref', 'Checked in', 'Registered', 'Certificate serial', 'Verify code', 'Certificate PDF', 'Emailed'],
  ];
  for (const r of data ?? []) {
    const b = one<any>(r.academy_batches);
    const c = one<any>(r.academy_certificates);
    rows.push([
      r.reg_code, r.name, r.email, r.phone, r.course_id,
      b ? `${ist(b.starts_at)} ${b.venue ?? ''}`.trim() : '',
      r.mode, r.status, r.source, r.payment_method, r.payment_status, r.amount, r.upi_ref,
      ist(r.attended_at), ist(r.created_at),
      c?.serial ?? '', c?.verify_code ?? '', certificatePublicUrl(c?.pdf_path) ?? '', ist(c?.emailed_at),
    ]);
  }

  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(toCsv(rows), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="academy-registrations-${course ?? 'all'}-${stamp}.csv"`,
      'cache-control': 'no-store',
    },
  });
};

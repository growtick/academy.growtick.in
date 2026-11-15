import type { APIRoute } from 'astro';
import { z } from 'zod';
import { serviceDb } from '../../lib/supabase';
import { json, readJson, sessionUser, zodMessage, one } from '../../lib/http';
import { paymentSubmitted } from '../../lib/email';

export const prerender = false;

const schema = z.object({
  enrollment_id: z.string().uuid(),
  // UPI transaction reference (UTR) is 12 digits; allow some app formats.
  upi_ref: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{10,22}$/, 'Enter the 12-digit UPI reference (UTR) from your payment app'),
  name: z.string().trim().min(2, 'Enter your full name as it should appear on the certificate').max(80),
  phone: z
    .string()
    .trim()
    .transform((v) => v.replace(/\D/g, '').replace(/^91(?=\d{10}$)/, ''))
    .pipe(z.string().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number')),
});

export const POST: APIRoute = async ({ request, cookies }) => {
  const user = await sessionUser({ request, cookies });
  if (!user) return json({ error: 'Please sign in again' }, 401);
  const db = serviceDb();
  if (!db) return json({ error: 'Payments are not configured yet' }, 503);

  const parsed = schema.safeParse(await readJson(request));
  if (!parsed.success) return json({ error: zodMessage(parsed.error) }, 400);
  const { enrollment_id, upi_ref, name, phone } = parsed.data;

  const { data: enr } = await db
    .from('academy_enrollments')
    .select('id, user_id, email, status, payment_status, amount, academy_courses (title)')
    .eq('id', enrollment_id)
    .maybeSingle();
  if (!enr || enr.user_id !== user.id) return json({ error: 'Enrolment not found' }, 404);
  if (enr.status !== 'pending_payment') return json({ error: 'This enrolment is already paid', redirect: '/dashboard' }, 409);

  // the same UTR can't unlock two enrolments
  const { data: reused } = await db.from('academy_enrollments').select('id').eq('upi_ref', upi_ref).neq('id', enrollment_id).limit(1);
  if (reused?.length) return json({ error: 'This UPI reference was already used for another enrolment' }, 409);

  const { error } = await db
    .from('academy_enrollments')
    .update({ upi_ref, name, phone, payment_status: 'pending' })
    .eq('id', enrollment_id);
  if (error) return json({ error: 'Could not save your payment details. Try again.' }, 500);
  await db.from('academy_profiles').update({ full_name: name, phone }).eq('id', user.id);

  await paymentSubmitted({
    to: enr.email,
    name,
    courseTitle: one<any>(enr.academy_courses)?.title ?? 'your course',
    amount: Number(enr.amount ?? 0),
    upiRef: upi_ref,
  }).catch(() => {});

  return json({ ok: true });
};

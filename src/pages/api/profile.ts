import type { APIRoute } from 'astro';
import { z } from 'zod';
import { serviceDb } from '../../lib/supabase';
import { json, readJson, sessionUser, zodMessage, ensureProfile } from '../../lib/http';

export const prerender = false;

const schema = z.object({
  full_name: z.string().trim().min(2, 'Enter your full name').max(80),
  phone: z
    .string()
    .trim()
    .transform((v) => v.replace(/\D/g, '').replace(/^91(?=\d{10}$)/, ''))
    .pipe(z.string().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number'))
    .nullable()
    .optional(),
});

// Learner updates the name printed on future certificates (and their mobile).
export const POST: APIRoute = async ({ request, cookies }) => {
  const user = await sessionUser({ request, cookies });
  if (!user) return json({ error: 'Please sign in again' }, 401);
  const db = serviceDb();
  if (!db) return json({ error: 'Not configured' }, 503);
  const parsed = schema.safeParse(await readJson(request));
  if (!parsed.success) return json({ error: zodMessage(parsed.error) }, 400);

  await ensureProfile(user);
  const { full_name, phone } = parsed.data;
  const { error } = await db.from('academy_profiles').update({ full_name, phone: phone ?? null }).eq('id', user.id);
  if (error) return json({ error: 'Could not save. Try again.' }, 500);

  // Online enrolments without a certificate yet pick up the new name.
  const { data: open } = await db.from('academy_enrollments').select('id, academy_certificates (id)').eq('user_id', user.id).eq('mode', 'online');
  const ids = (open ?? []).filter((r: any) => !(Array.isArray(r.academy_certificates) ? r.academy_certificates.length : r.academy_certificates)).map((r: any) => r.id);
  if (ids.length) await db.from('academy_enrollments').update({ name: full_name, ...(phone ? { phone } : {}) }).in('id', ids);

  return json({ ok: true, message: 'Saved.' });
};

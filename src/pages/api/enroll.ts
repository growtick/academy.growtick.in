import type { APIRoute } from 'astro';
import { z } from 'zod';
import { serviceDb } from '../../lib/supabase';
import { json, readJson, sessionUser, makeRegCode, ensureProfile } from '../../lib/http';
import { onlineEnrollment } from '../../lib/learn';

export const prerender = false;

const schema = z.object({ course: z.string().regex(/^[a-z0-9-]{2,60}$/) });

// Online enrolment for the signed-in learner.
// Free course → active immediately. Paid → pending_payment, then /pay/[id].
export const POST: APIRoute = async ({ request, cookies }) => {
  const user = await sessionUser({ request, cookies });
  if (!user) return json({ error: 'Please sign in first', redirect: '/login' }, 401);
  const db = serviceDb();
  if (!db) return json({ error: 'Enrolment is not configured yet' }, 503);

  const parsed = schema.safeParse(await readJson(request));
  if (!parsed.success) return json({ error: 'Unknown course' }, 400);

  const { data: course } = await db
    .from('academy_courses')
    .select('slug, delivery, online_price, status')
    .eq('slug', parsed.data.course)
    .maybeSingle();
  if (!course || course.status !== 'published' || course.delivery === 'offline') {
    return json({ error: 'This course is not available online' }, 404);
  }

  const existing = await onlineEnrollment(course.slug, user.id);
  if (existing) {
    return json({ ok: true, redirect: existing.status === 'pending_payment' ? `/pay/${existing.id}` : `/learn/${course.slug}` });
  }

  await ensureProfile(user);
  const { data: profile } = await db.from('academy_profiles').select('full_name, phone').eq('id', user.id).maybeSingle();
  const price = Number(course.online_price ?? 0);
  const free = price <= 0;

  const { data: row, error } = await db
    .from('academy_enrollments')
    .insert({
      course_id: course.slug,
      user_id: user.id,
      name: profile?.full_name || (user.email ?? 'Learner').split('@')[0],
      email: (user.email ?? '').toLowerCase(),
      phone: profile?.phone ?? null,
      mode: 'online',
      status: free ? 'active' : 'pending_payment',
      payment_method: free ? 'free' : 'upi',
      payment_status: free ? 'received' : 'pending',
      amount: free ? 0 : price,
      source: 'web',
      reg_code: makeRegCode(),
    })
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') {
      const again = await onlineEnrollment(course.slug, user.id);
      if (again) return json({ ok: true, redirect: again.status === 'pending_payment' ? `/pay/${again.id}` : `/learn/${course.slug}` });
    }
    return json({ error: 'Could not enrol. Please try again.' }, 500);
  }

  return json({ ok: true, redirect: free ? `/learn/${course.slug}` : `/pay/${row.id}` });
};

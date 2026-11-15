import type { APIRoute } from 'astro';
import { z } from 'zod';
import { serviceDb } from '../../../lib/supabase';
import { json, readJson, sessionUser } from '../../../lib/http';
import { onlineEnrollment, hasAccess } from '../../../lib/learn';

export const prerender = false;

const schema = z.object({ batch_id: z.string().uuid() });
const EARLY_MS = 15 * 60 * 1000;

// Join a live class: attaches the learner's online enrolment to the live batch,
// records attendance when joining during the session window, and returns the
// meeting link (which is never sent to the browser before that).
export const POST: APIRoute = async ({ request, cookies }) => {
  const user = await sessionUser({ request, cookies });
  if (!user) return json({ error: 'Please sign in again' }, 401);
  const db = serviceDb();
  if (!db) return json({ error: 'Not configured' }, 503);
  const parsed = schema.safeParse(await readJson(request));
  if (!parsed.success) return json({ error: 'Unknown class' }, 400);

  const { data: batch } = await db
    .from('academy_batches')
    .select('id, course_id, kind, starts_at, ends_at, meeting_url, status')
    .eq('id', parsed.data.batch_id)
    .maybeSingle();
  if (!batch || batch.kind !== 'live') return json({ error: 'Class not found' }, 404);

  const enr = await onlineEnrollment(batch.course_id, user.id);
  if (!hasAccess(enr)) return json({ error: 'Enrol in this course first' }, 403);

  const now = Date.now();
  const start = new Date(batch.starts_at).getTime();
  const end = new Date(batch.ends_at ?? batch.starts_at).getTime();
  if (now < start - EARLY_MS) return json({ error: 'The join link opens 15 minutes before the class starts' }, 400);
  if (now > end) return json({ error: 'This class has ended' }, 400);
  if (!batch.meeting_url) return json({ error: 'The trainer has not added the meeting link yet. Refresh in a minute.' }, 400);

  await db
    .from('academy_enrollments')
    .update({ batch_id: batch.id, ...(enr!.attended_at ? {} : { attended_at: new Date().toISOString() }) })
    .eq('id', enr!.id);

  return json({ ok: true, redirect: batch.meeting_url });
};

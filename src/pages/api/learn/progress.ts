import type { APIRoute } from 'astro';
import { z } from 'zod';
import { serviceDb } from '../../../lib/supabase';
import { json, readJson, sessionUser } from '../../../lib/http';
import { lessonWithCourse, onlineEnrollment, hasAccess } from '../../../lib/learn';
import { maybeIssueOnlineCertificate } from '../../../lib/certificates';

export const prerender = false;

const schema = z.object({ lesson_id: z.string().uuid(), undo: z.boolean().optional() });

// Mark a (non-quiz, non-live) lesson complete; issues the certificate when the
// learner has now met every requirement.
export const POST: APIRoute = async ({ request, cookies }) => {
  const user = await sessionUser({ request, cookies });
  if (!user) return json({ error: 'Please sign in again' }, 401);
  const db = serviceDb();
  if (!db) return json({ error: 'Not configured' }, 503);
  const parsed = schema.safeParse(await readJson(request));
  if (!parsed.success) return json({ error: 'Invalid lesson' }, 400);

  const lesson = await lessonWithCourse(parsed.data.lesson_id);
  if (!lesson) return json({ error: 'Lesson not found' }, 404);
  if (lesson.type === 'quiz') return json({ error: 'Pass the quiz to complete this lesson' }, 400);
  if (lesson.type === 'live') return json({ error: 'Live attendance is recorded by the trainer' }, 400);

  const enr = await onlineEnrollment(lesson.course_id, user.id);
  if (!hasAccess(enr)) return json({ error: 'Enrol in this course first' }, 403);

  if (parsed.data.undo) {
    await db.from('academy_lesson_progress').delete().eq('enrollment_id', enr!.id).eq('lesson_id', lesson.id);
    return json({ ok: true });
  }
  const { error } = await db
    .from('academy_lesson_progress')
    .upsert({ enrollment_id: enr!.id, lesson_id: lesson.id }, { onConflict: 'enrollment_id,lesson_id', ignoreDuplicates: true });
  if (error) return json({ error: 'Could not save progress' }, 500);

  let certificate = null;
  try {
    certificate = await maybeIssueOnlineCertificate(enr!.id);
  } catch (err) {
    console.error('auto certificate failed', err);
  }
  return json({ ok: true, certificate });
};

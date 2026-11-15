import type { APIRoute } from 'astro';
import { z } from 'zod';
import { serviceDb } from '../../../lib/supabase';
import { json, readJson, sessionUser } from '../../../lib/http';
import { lessonWithCourse, onlineEnrollment, hasAccess } from '../../../lib/learn';
import { maybeIssueOnlineCertificate } from '../../../lib/certificates';

export const prerender = false;

const schema = z.object({
  lesson_id: z.string().uuid(),
  // question id → chosen option index
  answers: z.record(z.string().uuid(), z.number().int().min(0).max(20)),
});

// Graded server-side: correct_index never leaves the server. Passing (score ≥
// course pass mark) completes the lesson and may issue the certificate.
export const POST: APIRoute = async ({ request, cookies }) => {
  const user = await sessionUser({ request, cookies });
  if (!user) return json({ error: 'Please sign in again' }, 401);
  const db = serviceDb();
  if (!db) return json({ error: 'Not configured' }, 503);
  const parsed = schema.safeParse(await readJson(request));
  if (!parsed.success) return json({ error: 'Answer every question before submitting' }, 400);

  const lesson = await lessonWithCourse(parsed.data.lesson_id);
  if (!lesson || lesson.type !== 'quiz') return json({ error: 'Quiz not found' }, 404);
  const enr = await onlineEnrollment(lesson.course_id, user.id);
  if (!hasAccess(enr)) return json({ error: 'Enrol in this course first' }, 403);

  const [{ data: questions }, { data: course }] = await Promise.all([
    db.from('academy_quiz_questions').select('id, correct_index').eq('lesson_id', lesson.id),
    db.from('academy_courses').select('pass_mark').eq('slug', lesson.course_id).maybeSingle(),
  ]);
  if (!questions?.length) return json({ error: 'This quiz has no questions yet' }, 400);

  const answers = parsed.data.answers;
  const missing = questions.filter((q) => answers[q.id] === undefined).length;
  if (missing) return json({ error: `Answer all questions (${missing} left)` }, 400);

  const correct = questions.filter((q) => answers[q.id] === q.correct_index).length;
  const score = Math.round((correct / questions.length) * 100);
  const passMark = course?.pass_mark ?? 70;
  const passed = score >= passMark;

  await db.from('academy_quiz_attempts').insert({ enrollment_id: enr!.id, lesson_id: lesson.id, score, passed, answers });

  let certificate = null;
  if (passed) {
    await db
      .from('academy_lesson_progress')
      .upsert({ enrollment_id: enr!.id, lesson_id: lesson.id }, { onConflict: 'enrollment_id,lesson_id', ignoreDuplicates: true });
    try {
      certificate = await maybeIssueOnlineCertificate(enr!.id);
    } catch (err) {
      console.error('auto certificate failed', err);
    }
  }

  // Only reveal which answers were wrong, not the right ones, so retakes still test.
  const wrong = questions.filter((q) => answers[q.id] !== q.correct_index).map((q) => q.id);
  return json({ ok: true, score, passed, pass_mark: passMark, correct, total: questions.length, wrong, certificate });
};

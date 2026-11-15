import type { APIRoute } from 'astro';
import { serviceDb } from '../../../lib/supabase';
import { sessionUser, isAdminId } from '../../../lib/http';
import { lessonWithCourse, onlineEnrollment, hasAccess } from '../../../lib/learn';

export const prerender = false;

// GET /api/learn/file?lesson=<uuid> → short-lived signed URL for the lesson's
// file in the private academy-files bucket (enrolled learners, previews, admins).
export const GET: APIRoute = async ({ request, cookies, url, redirect }) => {
  const id = url.searchParams.get('lesson') ?? '';
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response('Not found', { status: 404 });
  const user = await sessionUser({ request, cookies });
  if (!user) return redirect(`/login?next=${encodeURIComponent(url.pathname + url.search)}`);
  const db = serviceDb();
  if (!db) return new Response('Not configured', { status: 503 });

  const lesson = await lessonWithCourse(id);
  if (!lesson?.file_path) return new Response('Not found', { status: 404 });

  const enr = await onlineEnrollment(lesson.course_id, user.id);
  const enrolled = hasAccess(enr);
  const allowed = lesson.is_preview || enrolled || (await isAdminId(user.id));
  if (!allowed) return new Response('Enrol in this course to download this file.', { status: 403 });

  const { data, error } = await db.storage.from('academy-files').createSignedUrl(lesson.file_path, 300, { download: true });
  if (error || !data?.signedUrl) return new Response('File unavailable', { status: 404 });

  // downloading a "download" lesson counts as completing it
  if (lesson.type === 'download' && enrolled) {
    await db
      .from('academy_lesson_progress')
      .upsert({ enrollment_id: enr!.id, lesson_id: lesson.id }, { onConflict: 'enrollment_id,lesson_id', ignoreDuplicates: true });
  }
  return redirect(data.signedUrl, 302);
};

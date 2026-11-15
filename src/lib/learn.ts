import { serviceDb } from './supabase';
import { many } from './http';

export interface Lesson {
  id: string;
  module_id: string;
  title: string;
  type: 'video' | 'reading' | 'download' | 'quiz' | 'live';
  video_url: string | null;
  body: string | null;
  file_path: string | null;
  duration_min: number | null;
  is_preview: boolean;
  required: boolean;
  sort_order: number;
}

export interface Module {
  id: string;
  title: string;
  sort_order: number;
  lessons: Lesson[];
}

/** The learner's online enrolment for a course (or null). */
export async function onlineEnrollment(courseSlug: string, userId: string) {
  const db = serviceDb();
  if (!db) return null;
  const { data } = await db
    .from('academy_enrollments')
    .select('id, name, email, status, payment_status, payment_method, amount, upi_ref, attended_at, batch_id, created_at')
    .eq('course_id', courseSlug)
    .eq('user_id', userId)
    .eq('mode', 'online')
    .neq('status', 'cancelled')
    .maybeSingle();
  return data;
}

/** Can this enrolment open full lesson content? */
export function hasAccess(enr: { status: string } | null) {
  return !!enr && (enr.status === 'active' || enr.status === 'completed');
}

/** Course + ordered curriculum with full lesson content (server only). */
export async function loadCurriculum(courseSlug: string) {
  const db = serviceDb();
  if (!db) return null;
  const { data: course } = await db
    .from('academy_courses')
    .select(
      `slug, title, subtitle, delivery, online_price, pass_mark, certificate_kind, status,
       academy_modules (id, title, sort_order,
         academy_lessons (id, module_id, title, type, video_url, body, file_path, duration_min, is_preview, required, sort_order))`
    )
    .eq('slug', courseSlug)
    .maybeSingle();
  if (!course) return null;
  const modules: Module[] = many<any>(course.academy_modules)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((m) => ({
      id: m.id,
      title: m.title,
      sort_order: m.sort_order,
      lessons: many<Lesson>(m.academy_lessons).sort((a, b) => a.sort_order - b.sort_order),
    }));
  return { course, modules, lessons: modules.flatMap((m) => m.lessons) };
}

/** Lesson by id with its course slug (server only). */
export async function lessonWithCourse(lessonId: string) {
  const db = serviceDb();
  if (!db) return null;
  const { data } = await db
    .from('academy_lessons')
    .select('id, title, type, file_path, is_preview, required, academy_modules (course_id)')
    .eq('id', lessonId)
    .maybeSingle();
  if (!data) return null;
  const mod: any = Array.isArray(data.academy_modules) ? data.academy_modules[0] : data.academy_modules;
  return { ...data, course_id: mod?.course_id as string };
}

/** Completed lesson ids and passed quiz ids for an enrolment. */
export async function learnerState(enrollmentId: string) {
  const db = serviceDb();
  if (!db) return { done: new Set<string>(), passed: new Set<string>(), best: new Map<string, number>() };
  const [{ data: p }, { data: q }] = await Promise.all([
    db.from('academy_lesson_progress').select('lesson_id').eq('enrollment_id', enrollmentId),
    db.from('academy_quiz_attempts').select('lesson_id, score, passed').eq('enrollment_id', enrollmentId),
  ]);
  const best = new Map<string, number>();
  for (const a of q ?? []) best.set(a.lesson_id, Math.max(best.get(a.lesson_id) ?? 0, a.score));
  return {
    done: new Set<string>((p ?? []).map((r: any) => r.lesson_id)),
    passed: new Set<string>((q ?? []).filter((r: any) => r.passed).map((r: any) => r.lesson_id)),
    best,
  };
}

/** YouTube id from any youtube/youtu.be URL or a bare id. */
export function youtubeId(url: string | null | undefined): string | null {
  if (!url) return null;
  const s = url.trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  try {
    const u = new URL(s);
    if (u.hostname.endsWith('youtu.be')) return u.pathname.slice(1, 12) || null;
    if (u.hostname.includes('youtube')) {
      const v = u.searchParams.get('v');
      if (v) return v.slice(0, 11);
      const m = u.pathname.match(/\/(?:embed|shorts|live)\/([\w-]{11})/);
      if (m) return m[1];
    }
  } catch {}
  return null;
}

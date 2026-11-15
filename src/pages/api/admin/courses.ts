import type { APIRoute } from 'astro';
import { z } from 'zod';
import { serviceDb } from '../../../lib/supabase';
import { json, readJson, requireAdmin, zodMessage } from '../../../lib/http';

export const prerender = false;

const uuid = z.string().uuid();
const optText = (max: number) => z.string().trim().max(max).nullable().optional().transform((v) => (v ? v : null));
const lines = z
  .union([z.string(), z.array(z.string()), z.null()])
  .optional()
  .transform((v) => (Array.isArray(v) ? v : (v ?? '').split('\n')).map((s) => s.trim()).filter(Boolean));
// datetime-local inputs are entered in IST
const istDate = z
  .string()
  .min(10)
  .transform((v, ctx) => {
    const s = /[zZ]|[+-]\d\d:\d\d$/.test(v) ? v : `${v.length === 16 ? v + ':00' : v}+05:30`;
    const d = new Date(s);
    if (isNaN(d.getTime())) {
      ctx.addIssue({ code: 'custom', message: 'Invalid date' });
      return z.NEVER;
    }
    return d.toISOString();
  });

const schema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('save_course'),
    original_slug: z.string().nullable().optional(),
    slug: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{2,60}$/, 'Slug: lowercase letters, numbers and dashes'),
    title: z.string().trim().min(3).max(140),
    subtitle: optText(240),
    description: optText(5000),
    outcomes: lines,
    highlights: lines,
    cover_url: optText(500),
    delivery: z.enum(['offline', 'online', 'both']),
    online_price: z.number().int().min(0).max(1_000_000).nullable().optional(),
    certificate_kind: z.enum(['appreciation', 'completion']),
    pass_mark: z.number().int().min(0).max(100),
    status: z.enum(['draft', 'published']),
  }),
  z.object({
    action: z.literal('save_batch'),
    id: uuid.nullable().optional(),
    course_id: z.string(),
    kind: z.enum(['offline', 'live']),
    starts_at: istDate,
    ends_at: istDate,
    venue: optText(200),
    address: optText(300),
    map_url: optText(500),
    meeting_url: optText(500),
    capacity: z.number().int().min(0).max(100000).nullable().optional(),
    fee: z.number().int().min(0).max(1_000_000).nullable().optional(),
    pay_on_spot: z.boolean().optional(),
    status: z.enum(['open', 'full', 'closed', 'done']),
  }),
  z.object({ action: z.literal('delete_batch'), id: uuid }),
  z.object({ action: z.literal('save_module'), id: uuid.nullable().optional(), course_id: z.string(), title: z.string().trim().min(1).max(160), sort_order: z.number().int().nullable().optional() }),
  z.object({ action: z.literal('delete_module'), id: uuid }),
  z.object({
    action: z.literal('save_lesson'),
    id: uuid.nullable().optional(),
    module_id: uuid,
    title: z.string().trim().min(1).max(200),
    type: z.enum(['video', 'reading', 'download', 'quiz', 'live']),
    video_url: optText(500),
    body: optText(50000),
    duration_min: z.number().int().min(0).max(10000).nullable().optional(),
    is_preview: z.boolean().optional(),
    required: z.boolean().optional(),
    sort_order: z.number().int().nullable().optional(),
  }),
  z.object({ action: z.literal('delete_lesson'), id: uuid }),
  z.object({
    action: z.literal('save_question'),
    id: uuid.nullable().optional(),
    lesson_id: uuid,
    prompt: z.string().trim().min(3).max(1000),
    options: lines.pipe(z.array(z.string()).min(2, 'Give at least 2 options (one per line)').max(8)),
    correct_index: z.number().int().min(1, 'Correct option number starts at 1'),
    sort_order: z.number().int().nullable().optional(),
  }),
  z.object({ action: z.literal('delete_question'), id: uuid }),
  z.object({ action: z.literal('move'), table: z.enum(['module', 'lesson', 'question']), id: uuid, dir: z.enum(['up', 'down']) }),
]);

const TABLES = { module: ['academy_modules', 'course_id'], lesson: ['academy_lessons', 'module_id'], question: ['academy_quiz_questions', 'lesson_id'] } as const;

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!(await requireAdmin({ request, cookies }))) return json({ error: 'Admin sign-in required' }, 401);
  const db = serviceDb();
  if (!db) return json({ error: 'Database is not configured' }, 503);
  const parsed = schema.safeParse(await readJson(request));
  if (!parsed.success) return json({ error: zodMessage(parsed.error) }, 400);
  const a = parsed.data;

  const nextOrder = async (table: string, col: string, val: string) => {
    const { data } = await db.from(table).select('sort_order').eq(col, val).order('sort_order', { ascending: false }).limit(1);
    return ((data?.[0] as any)?.sort_order ?? 0) + 10;
  };
  const done = (error: { message: string; code?: string } | null, extra: object = {}) =>
    error ? json({ error: error.code === '23505' ? 'That slug is already used by another course' : error.message }, 400) : json({ ok: true, ...extra });

  switch (a.action) {
    case 'save_course': {
      const { action, original_slug, ...row } = a;
      if (original_slug && original_slug !== row.slug) {
        return json({ error: 'Changing the slug of an existing course is not supported (links and certificates use it)' }, 400);
      }
      if (original_slug) {
        const { error } = await db.from('academy_courses').update(row).eq('slug', original_slug);
        return done(error);
      }
      const { error } = await db.from('academy_courses').insert(row);
      return done(error, { redirect: `/admin/courses/${row.slug}` });
    }
    case 'save_batch': {
      const { action, id, ...row } = a;
      if (new Date(row.ends_at) <= new Date(row.starts_at)) return json({ error: 'End time must be after the start time' }, 400);
      const data = { ...row, capacity: row.capacity ?? 0, fee: row.fee ?? 0, pay_on_spot: row.kind === 'offline' ? !!row.pay_on_spot : false };
      const { error } = id ? await db.from('academy_batches').update(data).eq('id', id) : await db.from('academy_batches').insert(data);
      return done(error);
    }
    case 'delete_batch': {
      const { count } = await db.from('academy_enrollments').select('id', { head: true, count: 'exact' }).eq('batch_id', a.id);
      if (count) return json({ error: `This batch has ${count} registration(s). Set its status to closed instead.` }, 400);
      const { error } = await db.from('academy_batches').delete().eq('id', a.id);
      return done(error);
    }
    case 'save_module': {
      const { action, id, ...row } = a;
      const sort_order = row.sort_order ?? (id ? undefined : await nextOrder('academy_modules', 'course_id', row.course_id));
      const data = { ...row, ...(sort_order !== undefined ? { sort_order } : {}) };
      const { error } = id ? await db.from('academy_modules').update(data).eq('id', id) : await db.from('academy_modules').insert(data);
      return done(error);
    }
    case 'delete_module': {
      const { error } = await db.from('academy_modules').delete().eq('id', a.id);
      return done(error);
    }
    case 'save_lesson': {
      const { action, id, ...row } = a;
      const sort_order = row.sort_order ?? (id ? undefined : await nextOrder('academy_lessons', 'module_id', row.module_id));
      const data = { ...row, is_preview: !!row.is_preview, required: row.required ?? true, ...(sort_order !== undefined ? { sort_order } : {}) };
      const { error } = id ? await db.from('academy_lessons').update(data).eq('id', id) : await db.from('academy_lessons').insert(data);
      return done(error);
    }
    case 'delete_lesson': {
      const { error } = await db.from('academy_lessons').delete().eq('id', a.id);
      return done(error);
    }
    case 'save_question': {
      const { action, id, ...row } = a;
      if (row.correct_index > row.options.length) return json({ error: `Correct option must be between 1 and ${row.options.length}` }, 400);
      const sort_order = row.sort_order ?? (id ? undefined : await nextOrder('academy_quiz_questions', 'lesson_id', row.lesson_id));
      const data = { ...row, correct_index: row.correct_index - 1, ...(sort_order !== undefined ? { sort_order } : {}) };
      const { error } = id ? await db.from('academy_quiz_questions').update(data).eq('id', id) : await db.from('academy_quiz_questions').insert(data);
      return done(error);
    }
    case 'delete_question': {
      const { error } = await db.from('academy_quiz_questions').delete().eq('id', a.id);
      return done(error);
    }
    case 'move': {
      const [table, parent] = TABLES[a.table];
      const { data: me } = await db.from(table).select(`id, sort_order, ${parent}`).eq('id', a.id).maybeSingle();
      if (!me) return json({ error: 'Not found' }, 404);
      const { data: sibs } = await db.from(table).select('id, sort_order').eq(parent, (me as any)[parent]).order('sort_order').order('id');
      const list = (sibs ?? []) as { id: string; sort_order: number }[];
      const i = list.findIndex((s) => s.id === a.id);
      const j = a.dir === 'up' ? i - 1 : i + 1;
      if (i < 0 || j < 0 || j >= list.length) return json({ ok: true });
      [list[i], list[j]] = [list[j], list[i]];
      // renumber so ties can't stall reordering
      for (let k = 0; k < list.length; k++) {
        await db.from(table).update({ sort_order: (k + 1) * 10 }).eq('id', list[k].id);
      }
      return json({ ok: true });
    }
  }
};

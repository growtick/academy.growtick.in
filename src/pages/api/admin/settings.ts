import type { APIRoute } from 'astro';
import { z } from 'zod';
import { serviceDb } from '../../../lib/supabase';
import { json, readJson, requireAdmin, zodMessage } from '../../../lib/http';
import { SETTING_KEYS } from '../../../lib/settings';

export const prerender = false;

const schema = z
  .object(Object.fromEntries(SETTING_KEYS.map((k) => [k, z.string().trim().max(500).nullable().optional()])) as Record<(typeof SETTING_KEYS)[number], z.ZodOptional<z.ZodNullable<z.ZodString>>>)
  .refine((s) => !s.upi_id || /^[\w.\-]{2,256}@[a-zA-Z]{2,64}$/.test(s.upi_id), { message: 'UPI ID looks wrong (e.g. growtick@okaxis)', path: ['upi_id'] });

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!(await requireAdmin({ request, cookies }))) return json({ error: 'Admin sign-in required' }, 401);
  const db = serviceDb();
  if (!db) return json({ error: 'Database is not configured' }, 503);
  const parsed = schema.safeParse(await readJson(request));
  if (!parsed.success) return json({ error: zodMessage(parsed.error) }, 400);

  const now = new Date().toISOString();
  const rows = Object.entries(parsed.data)
    .filter(([, v]) => v !== undefined)
    .map(([key, value]) => ({ key, value: value ?? '', updated_at: now }));
  if (!rows.length) return json({ ok: true });
  const { error } = await db.from('academy_settings').upsert(rows);
  return error ? json({ error: error.message }, 500) : json({ ok: true, message: 'Settings saved.' });
};

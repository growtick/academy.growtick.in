import type { APIRoute } from 'astro';
import { z } from 'zod';
import { type AstroCookies, userDb, serviceDb } from '../../../lib/supabase';

export const prerender = false;

const schema = z.object({ enrollment_id: z.string().uuid() });

async function sessionUser(context: { request: Request; cookies: AstroCookies }): Promise<{ id: string } | null> {
  const db = userDb({ cookies: context.cookies, request: context.request });
  const { data } = await db.auth.getUser();
  return data?.user ?? null;
}

async function requireAdmin(context: { request: Request; cookies: AstroCookies }): Promise<boolean> {
  const user = await sessionUser(context);
  if (!user) return false;
  const sdb = serviceDb();
  if (!sdb) return false;
  const { data: profile } = await sdb.from('academy_profiles').select('role').eq('id', user.id).maybeSingle();
  return profile?.role === 'admin';
}

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!(await requireAdmin({ request, cookies }))) {
    return new Response(JSON.stringify({ error: 'Admin sign-in required' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }

  let body: { enrollment_id?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: 'Invalid input', details: parsed.error.flatten().fieldErrors }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }

  const sdb = serviceDb();
  if (!sdb) {
    return new Response(JSON.stringify({ error: 'Database is not configured' }), {
      status: 503,
      headers: { 'content-type': 'application/json' },
    });
  }

  const { error } = await sdb
    .from('academy_enrollments')
    .update({ attended_at: new Date().toISOString() })
    .eq('id', parsed.data.enrollment_id);
  if (error) {
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
};

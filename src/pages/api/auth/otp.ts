import type { APIRoute } from 'astro';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from 'astro:env/server';

export const prerender = false;

export const POST: APIRoute = async ({ request, url }) => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ error: 'Sign-in is not configured yet' }), {
      status: 503,
      headers: { 'content-type': 'application/json' },
    });
  }

  let body: { email?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }

  const email = String(body.email ?? '').trim().toLowerCase();
  if (!email || !email.includes('@')) {
    return new Response(JSON.stringify({ error: 'Enter a valid email address' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }

  const supabase = createSupabaseClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error } = await (supabase.auth as any).signInWithOtp({
    email,
    options: { redirectTo: `${url.origin}/auth/callback` },
  });
  if (error) {
    return new Response(JSON.stringify({ error: String(error?.message ?? error) }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
};

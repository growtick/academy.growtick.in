import type { APIContext } from 'astro';
import { createServerClient } from '@supabase/ssr';
import { SUPABASE_URL } from 'astro:env/server';
import { PUBLIC_SUPABASE_ANON_KEY as SUPABASE_ANON_KEY } from 'astro:env/client';
import { cookieAdapters } from './lib/supabase';

const PROTECTED_PREFIXES = ['/admin', '/dashboard', '/learn', '/pay'];

export const onRequest = async (
  context: APIContext,
  next: () => Promise<Response | void>
): Promise<Response | void> => {
  context.locals.supabase = createServerClient(
    SUPABASE_URL ?? '',
    SUPABASE_ANON_KEY ?? '',
    { cookies: cookieAdapters(context) }
  );

  const { data: { user } } = await context.locals.supabase.auth.getUser();
  context.locals.user = user ?? null;

  const path = new URL(context.request.url).pathname;
  const isProtected = PROTECTED_PREFIXES.some(
    (p) => path === p || path.startsWith(`${p}/`)
  );

  if (isProtected && !user) {
    return context.redirect(`/login?next=${encodeURIComponent(path)}`);
  }

  if (user && (path === '/admin' || path.startsWith('/admin/'))) {
    const { data: profile } = await context.locals.supabase
      .from('academy_profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();
    if (profile?.role !== 'admin') {
      return new Response('Forbidden', { status: 403 });
    }
  }

  return next();
};

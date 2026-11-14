import type { APIRoute } from 'astro';
import { createServerClient } from '@supabase/ssr';
import { cookieAdapters } from '../../lib/supabase';
import { SUPABASE_URL } from 'astro:env/server';
import { PUBLIC_SUPABASE_ANON_KEY as SUPABASE_ANON_KEY } from 'astro:env/client';

// OAuth / magic-link callback from Supabase Auth. Exchanges the code for a
// session, then redirects back. Best-effort: without real SMTP/keys this flow
// never completes, and offline registration needs no account at all.
export const GET: APIRoute = async ({ url, request, cookies, redirect }) => {
  const code = url.searchParams.get('code');
  const next = url.searchParams.get('next') ?? '/';

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return redirect('/login?error=not_configured');
  }

  if (code) {
    const supabase = createServerClient(
      SUPABASE_URL,
      SUPABASE_ANON_KEY,
      { cookies: cookieAdapters({ request, cookies }) }
    );
    try {
      await (supabase.auth as any).exchangeCodeForSession(code);
      // Give the async cookie-writing listener a tick to flush before we respond.
      await new Promise((resolve) => setTimeout(resolve, 0));
    } catch {}
  }

  return redirect(next);
};

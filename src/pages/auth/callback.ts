import type { APIRoute } from 'astro';
import type { EmailOtpType } from '@supabase/supabase-js';
import { userDb } from '../../lib/supabase';
import { ensureProfile, safeNext } from '../../lib/http';

export const prerender = false;

// Magic-link landing. Handles both PKCE (?code=) and token-hash
// (?token_hash=&type=) links, then creates the learner profile and links any
// earlier registrations made with the same email.
export const GET: APIRoute = async ({ url, request, cookies, redirect }) => {
  const next = safeNext(url.searchParams.get('next'));
  if (!import.meta.env.PUBLIC_SUPABASE_URL || !import.meta.env.PUBLIC_SUPABASE_ANON_KEY) {
    return redirect('/login?error=not_configured');
  }

  const supabase = userDb({ request, cookies });
  const code = url.searchParams.get('code');
  const tokenHash = url.searchParams.get('token_hash');
  const type = (url.searchParams.get('type') ?? 'email') as EmailOtpType;

  let user: { id: string; email?: string | null } | null = null;
  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) user = data.user;
  } else if (tokenHash) {
    const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error) user = data.user;
  }

  if (!user) {
    return redirect(`/login?error=link&next=${encodeURIComponent(next)}`);
  }
  await ensureProfile({ id: user.id, email: user.email ?? null });
  return redirect(next);
};

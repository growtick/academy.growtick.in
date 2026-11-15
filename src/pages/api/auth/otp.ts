import type { APIRoute } from 'astro';
import { z } from 'zod';
import { userDb } from '../../../lib/supabase';
import { json, readJson, safeNext } from '../../../lib/http';

export const prerender = false;

const schema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.string().email()),
  next: z.string().optional().nullable(),
});

// Sends a sign-in email. Uses the cookie-bound (PKCE) client so the code
// verifier is stored in this browser and /auth/callback?code=… can complete;
// the same email can carry a 6-digit code ({{ .Token }}) for other devices.
export const POST: APIRoute = async ({ request, cookies, url }) => {
  if (!import.meta.env.PUBLIC_SUPABASE_URL || !import.meta.env.PUBLIC_SUPABASE_ANON_KEY) {
    return json({ error: 'Sign-in is not configured yet' }, 503);
  }
  const parsed = schema.safeParse(await readJson(request));
  if (!parsed.success) return json({ error: 'Enter a valid email address' }, 400);
  const { email } = parsed.data;
  const next = safeNext(parsed.data.next);

  const supabase = userDb({ request, cookies });
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${url.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      shouldCreateUser: true,
    },
  });
  if (error) {
    const status = error.status === 429 ? 429 : 500;
    return json({ error: status === 429 ? 'Too many attempts. Wait a minute and try again.' : error.message }, status);
  }
  return json({ ok: true });
};

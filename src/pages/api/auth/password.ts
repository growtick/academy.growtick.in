import type { APIRoute } from 'astro';
import { z } from 'zod';
import { userDb } from '../../../lib/supabase';
import { json, readJson, safeNext, ensureProfile } from '../../../lib/http';

export const prerender = false;

const schema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.string().email()),
  password: z.string().min(1).max(200),
  next: z.string().optional().nullable(),
});

// Email + password sign-in (no email is sent, so no OTP rate limits).
// Passwords are set with scripts/set-password.js.
export const POST: APIRoute = async ({ request, cookies }) => {
  const parsed = schema.safeParse(await readJson(request));
  if (!parsed.success) return json({ error: 'Enter your email and password' }, 400);
  const { email, password } = parsed.data;

  const supabase = userDb({ request, cookies });
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    const msg = error?.status === 429 ? 'Too many tries. Wait a minute and try again.' : 'Wrong email or password.';
    return json({ error: msg }, error?.status === 429 ? 429 : 400);
  }
  await ensureProfile({ id: data.user.id, email: data.user.email ?? email });
  return json({ ok: true, redirect: safeNext(parsed.data.next) });
};

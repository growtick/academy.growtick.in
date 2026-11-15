import type { APIRoute } from 'astro';
import { z } from 'zod';
import { userDb } from '../../../lib/supabase';
import { json, readJson, safeNext, ensureProfile } from '../../../lib/http';

export const prerender = false;

const schema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.string().email()),
  token: z.string().trim().regex(/^\d{6,10}$/, 'Enter the code from the email'),
  next: z.string().optional().nullable(),
});

// Verifies the one-time code typed by the user and sets the session cookies.
export const POST: APIRoute = async ({ request, cookies }) => {
  const parsed = schema.safeParse(await readJson(request));
  if (!parsed.success) return json({ error: 'Enter your email and the code from the email' }, 400);
  const { email, token } = parsed.data;

  const supabase = userDb({ request, cookies });
  const { data, error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
  if (error || !data.user) return json({ error: 'That code is invalid or has expired. Request a new one.' }, 400);

  await ensureProfile({ id: data.user.id, email: data.user.email ?? email });
  return json({ ok: true, redirect: safeNext(parsed.data.next) });
};

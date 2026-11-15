import type { APIRoute } from 'astro';
import { z } from 'zod';
import { serviceDb, userDb } from '../../../lib/supabase';
import { json, readJson, safeNext, ensureProfile, zodMessage } from '../../../lib/http';

export const prerender = false;

const schema = z.object({
  full_name: z.string().trim().min(2, 'Enter your full name').max(80),
  email: z.string().trim().toLowerCase().pipe(z.string().email('Enter a valid email address')),
  password: z.string().min(8, 'Password must be at least 8 characters').max(200),
  next: z.string().optional().nullable(),
});

// Learner creates an account with their own password. Created server-side
// (email pre-confirmed) so no verification email is needed and it works even
// though public sign-ups are disabled on the shared Supabase project.
export const POST: APIRoute = async ({ request, cookies }) => {
  const sdb = serviceDb();
  if (!sdb) return json({ error: 'Sign-up is not configured yet' }, 503);
  const parsed = schema.safeParse(await readJson(request));
  if (!parsed.success) return json({ error: zodMessage(parsed.error) }, 400);
  const { full_name, email, password } = parsed.data;

  const { data: created, error } = await sdb.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name },
  });
  if (error || !created.user) {
    const exists = /already|registered|exists/i.test(error?.message ?? '');
    return json(
      { error: exists ? 'An account with this email already exists. Sign in instead (or ask us to reset your password).' : 'Could not create the account. Try again.' },
      exists ? 409 : 500
    );
  }

  await ensureProfile({ id: created.user.id, email });
  await sdb.from('academy_profiles').update({ full_name }).eq('id', created.user.id);

  const { error: signInError } = await userDb({ request, cookies }).auth.signInWithPassword({ email, password });
  if (signInError) return json({ ok: true, redirect: '/login' });
  return json({ ok: true, redirect: safeNext(parsed.data.next) });
};

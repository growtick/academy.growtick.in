import type { APIRoute } from 'astro';
import { z } from 'zod';
import { serviceDb } from '../../../lib/supabase';
import { json, readJson, requireAdmin, zodMessage, ensureProfile } from '../../../lib/http';

export const prerender = false;

const schema = z.object({
  action: z.enum(['set_password', 'make_admin', 'remove_admin']),
  email: z.string().trim().toLowerCase().pipe(z.string().email('Enter a valid email')),
  password: z.string().min(8, 'Password must be at least 8 characters').max(200).nullable().optional(),
});

async function findUser(db: NonNullable<ReturnType<typeof serviceDb>>, email: string) {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 500 });
    if (error) throw new Error(error.message);
    const u = data.users.find((x) => x.email?.toLowerCase() === email);
    if (u) return u;
    if (data.users.length < 500) return null;
  }
  return null;
}

// Admin account tools: reset a password (creates the account if missing),
// grant or remove admin.
export const POST: APIRoute = async ({ request, cookies }) => {
  const admin = await requireAdmin({ request, cookies });
  if (!admin) return json({ error: 'Admin sign-in required' }, 401);
  const db = serviceDb();
  if (!db) return json({ error: 'Not configured' }, 503);
  const parsed = schema.safeParse(await readJson(request));
  if (!parsed.success) return json({ error: zodMessage(parsed.error) }, 400);
  const { action, email, password } = parsed.data;

  try {
    let user = await findUser(db, email);
    if (action === 'set_password') {
      if (!password) return json({ error: 'Enter a new password' }, 400);
      const r = user
        ? await db.auth.admin.updateUserById(user.id, { password, email_confirm: true })
        : await db.auth.admin.createUser({ email, password, email_confirm: true });
      if (r.error || !r.data.user) return json({ error: r.error?.message ?? 'Failed' }, 500);
      await ensureProfile({ id: r.data.user.id, email });
      return json({ ok: true, message: user ? `Password changed for ${email}.` : `Account created for ${email}.` });
    }
    if (!user) return json({ error: `No account for ${email}. Set a password first to create it.` }, 404);
    if (action === 'remove_admin' && user.id === admin.id) return json({ error: "You can't remove your own admin access" }, 400);
    await ensureProfile({ id: user.id, email });
    const { error } = await db.from('academy_profiles').update({ role: action === 'make_admin' ? 'admin' : 'learner' }).eq('id', user.id);
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true, message: action === 'make_admin' ? `${email} is now an admin.` : `${email} is no longer an admin.` });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
};

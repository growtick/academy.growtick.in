import { serviceDb, userDb, type AstroCookies } from './supabase';

export interface Ctx {
  request: Request;
  cookies: AstroCookies;
}

export interface SessionUser {
  id: string;
  email: string | null;
}

/** JSON response helper. */
export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** PostgREST returns an object for many-to-one / one-to-one embeds and an array
 *  for one-to-many. Normalise either shape to a single row (or null). */
export function one<T = any>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

/** Normalise an embed to an array. */
export function many<T = any>(v: T | T[] | null | undefined): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

/** The signed-in user for this request, or null. */
export async function sessionUser(ctx: Ctx): Promise<SessionUser | null> {
  const { data } = await userDb(ctx).auth.getUser();
  const u = data?.user;
  return u ? { id: u.id, email: u.email ?? null } : null;
}

export async function isAdminId(userId: string): Promise<boolean> {
  const sdb = serviceDb();
  if (!sdb) return false;
  const { data } = await sdb.from('academy_profiles').select('role').eq('id', userId).maybeSingle();
  return data?.role === 'admin';
}

/** Returns the admin user, or null when not signed in / not an admin. */
export async function requireAdmin(ctx: Ctx): Promise<SessionUser | null> {
  const user = await sessionUser(ctx);
  if (!user) return null;
  return (await isAdminId(user.id)) ? user : null;
}

/** Parse a JSON body; returns null when the body is not valid JSON. */
export async function readJson<T = any>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

/** Format a zod error as "field: message" for the first failing field. */
export function zodMessage(err: { flatten(): { fieldErrors: Record<string, string[] | undefined>; formErrors: string[] } }) {
  const f = err.flatten();
  const key = Object.keys(f.fieldErrors)[0];
  if (key) return `${key}: ${f.fieldErrors[key]?.[0] ?? 'invalid'}`;
  return f.formErrors[0] ?? 'Invalid input';
}

/** Random registration code, e.g. GT3f9a1c2b. */
export function makeRegCode(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  return 'GT' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Batch date/time in IST, e.g. "Sun, 15 Nov 2026 · 2:00 pm – 5:00 pm". */
export function batchWhen(b: { starts_at?: string | null; ends_at?: string | null } | null | undefined): string {
  if (!b?.starts_at) return 'Date TBA';
  const tz = 'Asia/Kolkata';
  const s = new Date(b.starts_at);
  const day = s.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: tz });
  const t = (d: Date) => d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: tz });
  return b.ends_at ? `${day} · ${t(s)} – ${t(new Date(b.ends_at))}` : `${day} · ${t(s)}`;
}

export function batchWhere(b: { venue?: string | null; address?: string | null; kind?: string | null } | null | undefined): string {
  if (!b) return 'TBA';
  if (b.kind === 'live') return 'Online (live class link in your dashboard)';
  return [b.venue, b.address].filter(Boolean).join(', ') || 'Venue TBA';
}

/** Ensure the signed-in user has a profile row and link any registrations made
 *  with the same email before they had an account. */
export async function ensureProfile(user: SessionUser) {
  const sdb = serviceDb();
  if (!sdb || !user.email) return;
  const email = user.email.toLowerCase();
  const { data: existing } = await sdb.from('academy_profiles').select('id, email').eq('id', user.id).maybeSingle();
  if (!existing) {
    await sdb.from('academy_profiles').insert({ id: user.id, email, role: 'learner' });
  } else if (!existing.email) {
    await sdb.from('academy_profiles').update({ email }).eq('id', user.id);
  }
  await sdb.from('academy_enrollments').update({ user_id: user.id }).is('user_id', null).eq('email', email);
}

/** Only allow same-site relative redirects ("/x", never "//evil" or "https://"). */
export function safeNext(next: string | null | undefined, fallback = '/dashboard'): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return fallback;
  return next;
}

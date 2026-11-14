import type { APIRoute } from 'astro';
import { z } from 'zod';
import { serviceDb } from '../../lib/supabase';
import { registrationConfirmation } from '../../lib/email';

export const prerender = false;

const schema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80),
  email: z.string().email('Enter a valid email address').toLowerCase(),
  phone: z.string().trim().regex(/^[6-9][0-9]{9}$/, 'Enter a valid 10-digit Indian mobile number'),
  batch_id: z.string().uuid('Invalid batch'),
  consent: z.preprocess((v) => v === true || v === 'true', z.boolean()),
  turnstile_token: z.string().optional(),
});

function clientIp(request: Request): string {
  return (
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    '127.0.0.1'
  );
}

async function verifyTurnstile(token: string, ip: string): Promise<{ ok: boolean; reason?: string }> {
  const secret = import.meta.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    // Dev without a Turnstile secret: allow, but note it in logs.
    console.log('[turnstile skipped — no TURNSTILE_SECRET_KEY] ip:', ip);
    return { ok: true };
  }
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret, response: token, remoteip: ip }),
    });
    const json = (await res.json()) as { success?: boolean; 'error-codes'?: string[] };
    return json.success ? { ok: true } : { ok: false, reason: json['error-codes']?.join(', ') ?? 'verification failed' };
  } catch (err) {
    return { ok: false, reason: String(err) };
  }
}

function makeRegCode(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  return 'GT' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export const POST: APIRoute = async ({ request }) => {
  const db = serviceDb();
  if (!db) {
    return new Response(JSON.stringify({ error: 'Registrations are not configured yet' }), {
      status: 503,
      headers: { 'content-type': 'application/json' },
    });
  }

  let body: { name?: string; email?: string; phone?: string; batch_id?: string; consent?: boolean; turnstile_token?: string };
  const ct = request.headers.get('content-type') ?? '';
  if (ct.includes('application/json')) {
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid request body' }), { status: 400, headers: { 'content-type': 'application/json' } });
    }
  } else {
    // FormData fallback (regular form POST without JS).
    const fd = await request.formData();
    const asStr = (key: string): string | undefined => {
      const v = fd.get(key);
      return v === null || v === undefined ? undefined : String(v);
    };
    body = {
      name: asStr('name'),
      email: asStr('email'),
      phone: asStr('phone'),
      batch_id: asStr('batch_id'),
      consent: fd.get('consent') === 'true' || fd.get('consent') === 'on' || fd.get('consent') === '',
      turnstile_token: asStr('turnstile_token'),
    };
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: 'Invalid input', details: parsed.error.flatten().fieldErrors }),
      { status: 400, headers: { 'content-type': 'application/json' } }
    );
  }
  const { name, email, phone, batch_id, turnstile_token } = parsed.data;

  const ip = clientIp(request);
  const turnstile = await verifyTurnstile(turnstile_token ?? '', ip);
  if (!turnstile.ok) {
    return new Response(JSON.stringify({ error: 'Spam check failed', reason: turnstile.reason }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }

  // Fetch batch for fee/course context (service role bypasses RLS).
  const { data: batch } = await db.from('academy_batches').select('id, course_id, fee, pay_on_spot, status').eq('id', batch_id).maybeSingle();
  if (!batch) {
    return new Response(JSON.stringify({ error: 'Batch not found' }), { status: 404, headers: { 'content-type': 'application/json' } });
  }
  if (batch.status !== 'open') {
    return new Response(JSON.stringify({ error: 'Batch is not open for registration' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }

  const regCode = makeRegCode();
  const { data: result, error: rpcError } = await db.rpc('academy_register_for_batch', {
    p_batch_id: batch_id,
    p_name: name,
    p_email: email,
    p_phone: phone,
    p_mode: 'offline',
    p_payment_method: batch.pay_on_spot ? 'cash' : 'upi',
    p_source: 'web',
    p_user_id: null,
    p_reg_code: regCode,
  });

  if (rpcError) {
    return new Response(JSON.stringify({ error: 'Registration failed', details: String(rpcError) }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
  const row = Array.isArray(result) ? result[0] : result;
  if (!row?.ok) {
    return new Response(JSON.stringify({ error: row?.error ?? 'Batch is full or unavailable' }), {
      status: 409,
      headers: { 'content-type': 'application/json' },
    });
  }

  // Confirmation email (fire and forget — registration stands even if mail fails).
  const { data: course } = await db.from('academy_courses').select('title').eq('slug', batch.course_id).maybeSingle();
  void registrationConfirmation({
    to: email,
    name,
    courseTitle: course?.title ?? 'this course',
    batchWhen: 'Sun 15 Nov 2026 · 2:00–5:00 PM',
    batchWhere: 'Chickpet Pathshala Hall, Shri Adinath Jain Temple, Chickpet, Bangalore',
    fee: Number(batch.fee ?? 0),
    regCode,
    verifyUrl: `${new URL(request.url).origin}/verify`,
  }).catch(() => {});

  // Log the email attempt (fire and forget — never blocks the response).
  void (async () => {
    try {
      await db.from('academy_email_log').insert({
        recipient: email,
        subject: `Registered — ${course?.title ?? 'course'}`,
        template: 'registration-confirmation',
        status: 'queued',
      });
    } catch {}
  })();

  return new Response(
    JSON.stringify({ ok: true, reg_code: regCode, enrollment_id: row.enrollment_id }),
    { status: 200, headers: { 'content-type': 'application/json' } }
  );
};

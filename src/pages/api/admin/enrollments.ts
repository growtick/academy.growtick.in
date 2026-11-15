import type { APIRoute } from 'astro';
import { z } from 'zod';
import { serviceDb } from '../../../lib/supabase';
import { json, readJson, requireAdmin, zodMessage, makeRegCode, one, batchWhen, batchWhere } from '../../../lib/http';
import { peopleFromCsv } from '../../../lib/csv';
import { issueCertificate } from '../../../lib/certificates';
import { registrationConfirmation, paymentApproved, paymentRejected, liveReminder } from '../../../lib/email';

export const prerender = false;

const id = z.string().uuid();
const phone = z
  .string()
  .trim()
  .transform((v) => v.replace(/\D/g, '').replace(/^91(?=\d{10}$)/, ''))
  .pipe(z.string().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number'));

const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('checkin'), enrollment_id: id, undo: z.boolean().optional() }),
  z.object({ action: z.literal('cash'), enrollment_id: id, received: z.boolean() }),
  z.object({ action: z.literal('cancel'), enrollment_id: id, undo: z.boolean().optional() }),
  z.object({
    action: z.literal('walkin'),
    batch_id: id,
    name: z.string().trim().min(2).max(80),
    email: z.string().trim().toLowerCase().pipe(z.string().email('Enter a valid email')),
    phone: phone.nullable().optional(),
    present: z.boolean().optional(),
    paid: z.boolean().optional(),
    send_email: z.boolean().optional(),
  }),
  z.object({ action: z.literal('import'), batch_id: id, csv: z.string().min(1).max(2_000_000), send_email: z.boolean().optional() }),
  z.object({ action: z.literal('approve_upi'), enrollment_id: id }),
  z.object({ action: z.literal('reject_upi'), enrollment_id: id, reason: z.string().max(300).nullable().optional() }),
  z.object({ action: z.literal('issue'), enrollment_id: id }),
  z.object({ action: z.literal('resend'), enrollment_id: id }),
  z.object({ action: z.literal('issue_batch'), batch_id: id }),
  z.object({ action: z.literal('remind'), batch_id: id }),
]);

export const POST: APIRoute = async ({ request, cookies }) => {
  const admin = await requireAdmin({ request, cookies });
  if (!admin) return json({ error: 'Admin sign-in required' }, 401);
  const db = serviceDb();
  if (!db) return json({ error: 'Database is not configured' }, 503);

  const parsed = schema.safeParse(await readJson(request));
  if (!parsed.success) return json({ error: zodMessage(parsed.error) }, 400);
  const a = parsed.data;

  const loadBatch = async (batchId: string) => {
    const { data } = await db
      .from('academy_batches')
      .select('id, course_id, kind, starts_at, ends_at, venue, address, fee, pay_on_spot, academy_courses (title, slug)')
      .eq('id', batchId)
      .maybeSingle();
    return data;
  };

  const loadEnrollment = async (enrollmentId: string) => {
    const { data } = await db
      .from('academy_enrollments')
      .select('id, name, email, status, mode, amount, payment_status, batch_id, course_id, academy_courses (title, slug)')
      .eq('id', enrollmentId)
      .maybeSingle();
    return data;
  };

  switch (a.action) {
    case 'checkin': {
      const { error } = await db
        .from('academy_enrollments')
        .update(a.undo ? { attended_at: null, checked_in_by: null } : { attended_at: new Date().toISOString(), checked_in_by: admin.id })
        .eq('id', a.enrollment_id);
      return error ? json({ error: error.message }, 500) : json({ ok: true });
    }

    case 'cash': {
      const enr = await loadEnrollment(a.enrollment_id);
      if (!enr) return json({ error: 'Registration not found' }, 404);
      let amount = enr.amount;
      if (a.received && !amount && enr.batch_id) {
        const b = await loadBatch(enr.batch_id);
        amount = b?.fee ?? null;
      }
      const { error } = await db
        .from('academy_enrollments')
        .update({ payment_status: a.received ? 'received' : 'pending', payment_method: 'cash', amount })
        .eq('id', a.enrollment_id);
      return error ? json({ error: error.message }, 500) : json({ ok: true });
    }

    case 'cancel': {
      const { error } = await db
        .from('academy_enrollments')
        .update({ status: a.undo ? 'active' : 'cancelled' })
        .eq('id', a.enrollment_id);
      return error ? json({ error: error.message }, 500) : json({ ok: true });
    }

    case 'walkin': {
      const batch = await loadBatch(a.batch_id);
      if (!batch) return json({ error: 'Batch not found' }, 404);
      const { data: dup } = await db
        .from('academy_enrollments')
        .select('id, reg_code')
        .eq('batch_id', a.batch_id)
        .eq('email', a.email)
        .neq('status', 'cancelled')
        .maybeSingle();
      if (dup) return json({ error: `Already registered (code ${dup.reg_code}). Search for them in the list.` }, 409);
      const regCode = makeRegCode();
      const now = new Date().toISOString();
      const { error } = await db.from('academy_enrollments').insert({
        course_id: batch.course_id,
        batch_id: batch.id,
        name: a.name,
        email: a.email,
        phone: a.phone ?? null,
        mode: 'offline',
        status: 'active',
        payment_method: 'cash',
        payment_status: a.paid ? 'received' : 'pending',
        amount: a.paid ? batch.fee : null,
        source: 'walk-in',
        reg_code: regCode,
        attended_at: a.present ? now : null,
        checked_in_by: a.present ? admin.id : null,
      });
      if (error) return json({ error: error.message }, 500);
      if (a.send_email) {
        const course = one<any>(batch.academy_courses);
        await registrationConfirmation({
          to: a.email,
          name: a.name,
          courseTitle: course?.title ?? 'Growtick Academy course',
          batchWhen: batchWhen(batch),
          batchWhere: batchWhere(batch),
          fee: Number(batch.fee ?? 0),
          payOnSpot: !!batch.pay_on_spot,
          regCode,
        }).catch(() => {});
      }
      return json({ ok: true, reg_code: regCode, message: `Added ${a.name} (${regCode}).` });
    }

    case 'import': {
      const batch = await loadBatch(a.batch_id);
      if (!batch) return json({ error: 'Batch not found' }, 404);
      const { people, skipped } = peopleFromCsv(a.csv);
      const { data: existing } = await db.from('academy_enrollments').select('email').eq('batch_id', a.batch_id).neq('status', 'cancelled');
      const have = new Set((existing ?? []).map((r: any) => String(r.email).toLowerCase()));
      const fresh = people.filter((p) => {
        if (have.has(p.email)) {
          skipped.push({ line: 0, reason: `${p.email} is already registered` });
          return false;
        }
        return true;
      });
      const rows = fresh.map((p) => ({
        course_id: batch.course_id,
        batch_id: batch.id,
        name: p.name,
        email: p.email,
        phone: p.phone,
        mode: 'offline',
        status: 'active',
        payment_method: 'cash',
        payment_status: 'pending',
        source: 'import',
        reg_code: makeRegCode(),
      }));
      if (rows.length) {
        const { error } = await db.from('academy_enrollments').insert(rows);
        if (error) return json({ error: `Import failed, nothing was added: ${error.message}` }, 500);
      }
      if (a.send_email && rows.length) {
        const course = one<any>(batch.academy_courses);
        for (const r of rows) {
          await registrationConfirmation({
            to: r.email,
            name: r.name,
            courseTitle: course?.title ?? 'Growtick Academy course',
            batchWhen: batchWhen(batch),
            batchWhere: batchWhere(batch),
            fee: Number(batch.fee ?? 0),
            payOnSpot: !!batch.pay_on_spot,
            regCode: r.reg_code,
          }).catch(() => {});
        }
      }
      const skippedText = skipped.length
        ? ` Skipped ${skipped.length}: ` + skipped.slice(0, 8).map((s) => (s.line ? `line ${s.line}: ` : '') + s.reason).join('; ') + (skipped.length > 8 ? '…' : '')
        : '';
      return json({ ok: true, added: rows.length, skipped, message: `Imported ${rows.length} registration(s).${skippedText}` });
    }

    case 'approve_upi': {
      const enr = await loadEnrollment(a.enrollment_id);
      if (!enr) return json({ error: 'Enrollment not found' }, 404);
      const { error } = await db
        .from('academy_enrollments')
        .update({ payment_status: 'received', status: 'active' })
        .eq('id', a.enrollment_id);
      if (error) return json({ error: error.message }, 500);
      const course = one<any>(enr.academy_courses);
      await paymentApproved({ to: enr.email, name: enr.name, courseTitle: course?.title ?? 'your course', slug: course?.slug ?? enr.course_id }).catch(() => {});
      return json({ ok: true });
    }

    case 'reject_upi': {
      const enr = await loadEnrollment(a.enrollment_id);
      if (!enr) return json({ error: 'Enrollment not found' }, 404);
      const { error } = await db
        .from('academy_enrollments')
        .update({ payment_status: 'rejected', status: 'pending_payment' })
        .eq('id', a.enrollment_id);
      if (error) return json({ error: error.message }, 500);
      const course = one<any>(enr.academy_courses);
      await paymentRejected({ to: enr.email, name: enr.name, courseTitle: course?.title ?? 'your course', enrollmentId: enr.id, reason: a.reason ?? undefined }).catch(() => {});
      return json({ ok: true });
    }

    case 'issue':
    case 'resend': {
      if (a.action === 'issue') {
        const { data: e } = await db.from('academy_enrollments').select('mode, attended_at, status').eq('id', a.enrollment_id).maybeSingle();
        if (!e) return json({ error: 'Registration not found' }, 404);
        if (e.status === 'cancelled') return json({ error: 'This registration is cancelled' }, 400);
        if (e.mode === 'offline' && !e.attended_at) return json({ error: 'Check the attendee in before issuing a certificate' }, 400);
      }
      try {
        const r = await issueCertificate({ enrollmentId: a.enrollment_id, resend: a.action === 'resend' });
        return json({ ...r, message: a.action === 'resend' ? `Re-sent ${r.serial}.` : `Issued ${r.serial}.` });
      } catch (err) {
        return json({ error: (err as Error).message }, 500);
      }
    }

    case 'issue_batch': {
      const { data: present } = await db
        .from('academy_enrollments')
        .select('id, academy_certificates (id)')
        .eq('batch_id', a.batch_id)
        .neq('status', 'cancelled')
        .not('attended_at', 'is', null);
      const todo = (present ?? []).filter((r: any) => !one(r.academy_certificates));
      let issued = 0;
      const failed: string[] = [];
      for (const r of todo) {
        try {
          await issueCertificate({ enrollmentId: r.id });
          issued++;
        } catch (err) {
          failed.push((err as Error).message);
        }
      }
      return json({
        ok: true,
        issued,
        failed: failed.length,
        message: `Issued ${issued} certificate(s).` + (failed.length ? ` ${failed.length} failed: ${failed[0]}` : ''),
      });
    }

    case 'remind': {
      const batch = await loadBatch(a.batch_id);
      if (!batch) return json({ error: 'Batch not found' }, 404);
      // everyone booked on this batch, plus (for live classes) every active online learner of the course
      let q = db.from('academy_enrollments').select('name, email').eq('status', 'active');
      q = batch.kind === 'live'
        ? q.or(`batch_id.eq.${batch.id},and(course_id.eq.${batch.course_id},mode.eq.online)`)
        : q.eq('batch_id', batch.id);
      const { data: people } = await q;
      const course = one<any>(batch.academy_courses);
      const seen = new Set<string>();
      let sent = 0;
      for (const p of people ?? []) {
        if (seen.has(p.email)) continue;
        seen.add(p.email);
        const r = await liveReminder({
          to: p.email,
          name: p.name,
          courseTitle: course?.title ?? 'your course',
          when: batchWhen(batch),
          slug: course?.slug ?? batch.course_id,
        });
        if (r.ok) sent++;
      }
      return json({ ok: true, message: `Sent ${sent} reminder(s).` });
    }
  }
};

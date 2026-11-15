-- Growtick Academy: Phase 1 fixes (offline flow hardening). Idempotent.
--
-- 1. academy_register_for_batch() returned an error row for "batch not found" /
--    "batch full" but did NOT stop: plpgsql `return query` only appends a row,
--    so the insert still ran and full batches were oversold. Adds `return;`
--    and a duplicate (same batch + email) check.
-- 2. academy_profiles had a `for all using (true)` policy, so any signed-in
--    user could read every profile (emails, phones). Replaced with owner/admin
--    read only.
-- 3. service_role was missing UPDATE on academy_certificates (emailed_at never
--    saved) and the privileges needed for walk-ins, CSV import, payments,
--    settings and the admin screens.
-- 4. Certificate serials came from count(*)+1 (racy). Now a sequence.

-- ---------------------------------------------------------------------------
-- 1. registration function
-- ---------------------------------------------------------------------------
create or replace function academy_register_for_batch(
  p_batch_id uuid,
  p_name text,
  p_email text,
  p_phone text,
  p_mode text,
  p_payment_method text,
  p_source text,
  p_user_id uuid,
  p_reg_code text
) returns table (ok boolean, enrollment_id uuid, error text)
language plpgsql security definer set search_path = public as $$
declare
  v_capacity integer;
  v_course_id text;
  v_status text;
  v_count integer;
  v_id uuid;
begin
  select capacity, course_id, status into v_capacity, v_course_id, v_status
  from academy_batches where id = p_batch_id for update;
  if not found then
    return query select false, null::uuid, 'batch not found'::text;
    return;
  end if;
  if v_status <> 'open' then
    return query select false, null::uuid, 'batch is not open for registration'::text;
    return;
  end if;
  if exists (
    select 1 from academy_enrollments
     where batch_id = p_batch_id and lower(email) = lower(p_email) and status <> 'cancelled'
  ) then
    return query select false, null::uuid, 'already registered'::text;
    return;
  end if;
  if v_capacity > 0 then
    select count(*) into v_count from academy_enrollments
     where batch_id = p_batch_id and status <> 'cancelled';
    if v_count >= v_capacity then
      return query select false, null::uuid, 'batch full'::text;
      return;
    end if;
  end if;
  insert into academy_enrollments (
    course_id, batch_id, name, email, phone, mode, payment_method,
    payment_status, status, source, reg_code, user_id
  ) values (
    v_course_id, p_batch_id, p_name, lower(p_email), p_phone, p_mode, p_payment_method,
    'pending', 'active', p_source, p_reg_code, p_user_id
  ) returning id into v_id;
  return query select true, v_id, null::text;
exception when unique_violation then
  return query select false, null::uuid, 'duplicate registration or reg_code'::text;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. profiles: owner + admin read only
-- ---------------------------------------------------------------------------
drop policy if exists "Profiles: service role and admins via security-definer functions" on academy_profiles;
drop policy if exists "Profiles: admins read all" on academy_profiles;
create policy "Profiles: admins read all" on academy_profiles
  for select using (academy_is_admin());

-- ---------------------------------------------------------------------------
-- 3. service_role privileges (server endpoints only; RLS is bypassed by
--    service_role, but table privileges still apply on this project)
-- ---------------------------------------------------------------------------
grant usage on schema public to service_role;
grant select, insert, update, delete on
  academy_profiles,
  academy_courses,
  academy_batches,
  academy_modules,
  academy_lessons,
  academy_quiz_questions,
  academy_enrollments,
  academy_lesson_progress,
  academy_quiz_attempts,
  academy_certificates,
  academy_email_log,
  academy_settings
to service_role;

-- ---------------------------------------------------------------------------
-- 4. certificate serial sequence
-- ---------------------------------------------------------------------------
create sequence if not exists academy_certificate_serial_seq;
select setval(
  'academy_certificate_serial_seq',
  greatest((select count(*) from academy_certificates), 1),
  (select count(*) from academy_certificates) > 0
);

create or replace function academy_next_certificate_serial() returns bigint
language sql security definer set search_path = public as $$
  select nextval('academy_certificate_serial_seq')
$$;
revoke execute on function academy_next_certificate_serial() from public, anon, authenticated;
grant execute on function academy_next_certificate_serial() to service_role;
grant usage, select on sequence academy_certificate_serial_seq to service_role;

create index if not exists academy_enrollments_batch_email_idx
  on academy_enrollments (batch_id, lower(email));

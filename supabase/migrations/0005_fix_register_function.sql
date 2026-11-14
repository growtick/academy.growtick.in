-- Growtick Academy: fix registration function to record course_id.
--
-- academy_register_for_batch() (deployed by 0001_academy.sql) inserted into
-- academy_enrollments without setting course_id, which is NOT NULL, so every
-- registration failed with:
--   null value in column "course_id" of relation "academy_enrollments"
--   violates not-null constraint
--
-- Redefines the function (idempotent via create or replace) to populate
-- course_id from the batch being registered for. Apply to the linked project.

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
  v_count integer;
  v_id uuid;
begin
  select capacity, course_id into v_capacity, v_course_id
  from academy_batches where id = p_batch_id for update;
  if not found then
    return query select false, null, 'batch not found';
  end if;
  if v_capacity > 0 then
    select count(*) into v_count from academy_enrollments
     where batch_id = p_batch_id and status = 'active';
    if v_count >= v_capacity then
      return query select false, null, 'batch full';
    end if;
  end if;
  insert into academy_enrollments (
    course_id, batch_id, name, email, phone, mode, payment_method,
    payment_status, status, source, reg_code, user_id
  ) values (
    v_course_id, p_batch_id, p_name, p_email, p_phone, p_mode, p_payment_method,
    'pending', 'active', p_source, p_reg_code, p_user_id
  ) returning id into v_id;
  return query select true, v_id, null;
exception when unique_violation then
  return query select false, null, 'duplicate registration or reg_code';
end;
$$;

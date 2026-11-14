-- Growtick Academy: table privileges for public access.
--
-- 0001_academy.sql was already applied to the linked project without these
-- grants, so every public read failed with "permission denied for table ...".
-- RLS policies are not enough: table-level privileges must be granted
-- explicitly. Idempotent: safe to re-run.

grant usage on schema public to anon, authenticated;

grant select on academy_profiles to authenticated;
grant select on academy_courses to anon, authenticated;
grant select on academy_batches to anon, authenticated;
grant select on academy_modules to anon, authenticated;
grant select on academy_lessons to anon, authenticated;
grant select on academy_certificates to anon, authenticated;

grant insert on academy_enrollments to anon, authenticated;

grant execute on function academy_register_for_batch(
  p_batch_id uuid,
  p_name text,
  p_email text,
  p_phone text,
  p_mode text,
  p_payment_method text,
  p_source text,
  p_user_id uuid,
  p_reg_code text
) to anon, authenticated;

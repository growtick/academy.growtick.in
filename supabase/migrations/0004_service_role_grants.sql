-- Growtick Academy: table privileges for the service-role key.
--
-- The linked project's service-role key (used by server endpoints such as
-- /api/register via serviceDb()) does not have implicit table privileges, so
-- server reads/writes failed with "permission denied for table ..." (surfaced
-- as "Batch not found" in /api/register). Grant what the backend needs.
-- Idempotent: safe to re-run.

grant usage on schema public to service_role;

grant select on academy_profiles to service_role;
grant select on academy_courses to service_role;
grant select on academy_batches to service_role;
grant select on academy_modules to service_role;
grant select on academy_lessons to service_role;
grant select on academy_certificates to service_role;
grant select on academy_settings to service_role;

grant select on academy_enrollments to service_role;
grant insert on academy_enrollments to service_role;
grant insert on academy_email_log to service_role;

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
) to service_role;

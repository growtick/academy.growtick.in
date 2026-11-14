-- Growtick Academy: service-role privileges for certificates + check-in.
-- service_role (used by server endpoints such as /api/certificates/issue and
-- /api/admin/checkin) needs explicit table-level privileges in addition to
-- RLS policies. Idempotent: safe to re-run.

grant usage on schema public to service_role;

grant insert on academy_certificates to service_role;
grant update (attended_at, status, payment_status, upi_ref, checked_in_by) on academy_enrollments to service_role;

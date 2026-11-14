-- Growtick Academy: service_role needs to read enrollments too.
--
-- 0004_service_role_grants.sql granted INSERT on academy_enrollments (for the
-- registration RPC path) but not SELECT. The /registered/[reg_code] confirmation
-- page reads enrollments by reg_code via serviceDb(), so add SELECT. Idempotent.

grant select on academy_enrollments to service_role;

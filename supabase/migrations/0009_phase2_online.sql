-- Growtick Academy: Phase 2 (online learning). Idempotent.
--
-- * Lesson content (video_url, body, file_path) and live meeting links are no
--   longer readable with the public anon key: only the outline columns are
--   granted. The /learn pages load content server-side (service role) after
--   checking the learner's enrolment.
-- * Learners can read their own progress and quiz attempts.
-- * One active online enrolment per learner per course.
-- * Private storage bucket for lesson downloads (signed URLs only).

-- ---------------------------------------------------------------------------
-- column-level read access for the public
-- ---------------------------------------------------------------------------
revoke select on academy_lessons from anon, authenticated;
grant select (id, module_id, title, type, duration_min, is_preview, required, sort_order)
  on academy_lessons to anon, authenticated;

revoke select on academy_batches from anon, authenticated;
grant select (id, course_id, kind, starts_at, ends_at, venue, address, map_url,
              capacity, fee, pay_on_spot, status, created_at)
  on academy_batches to anon, authenticated;

-- ---------------------------------------------------------------------------
-- learner reads of their own progress
-- ---------------------------------------------------------------------------
drop policy if exists "Progress: learners read their own" on academy_lesson_progress;
create policy "Progress: learners read their own" on academy_lesson_progress
  for select using (
    exists (select 1 from academy_enrollments e where e.id = enrollment_id and e.user_id = auth.uid())
  );

drop policy if exists "Quiz attempts: learners read their own" on academy_quiz_attempts;
create policy "Quiz attempts: learners read their own" on academy_quiz_attempts
  for select using (
    exists (select 1 from academy_enrollments e where e.id = enrollment_id and e.user_id = auth.uid())
  );

grant select on academy_lesson_progress, academy_quiz_attempts to authenticated;
grant select on academy_enrollments to authenticated;

-- ---------------------------------------------------------------------------
-- one online enrolment per learner per course
-- ---------------------------------------------------------------------------
create unique index if not exists academy_enrollments_online_user_course_uniq
  on academy_enrollments (course_id, user_id)
  where mode = 'online' and user_id is not null and status <> 'cancelled';

create index if not exists academy_enrollments_user_idx on academy_enrollments (user_id);
create index if not exists academy_modules_course_idx on academy_modules (course_id, sort_order);
create index if not exists academy_lessons_module_idx on academy_lessons (module_id, sort_order);
create index if not exists academy_quiz_questions_lesson_idx on academy_quiz_questions (lesson_id);

-- quiz questions are shown in admin-defined order
alter table academy_quiz_questions add column if not exists sort_order integer not null default 0;

-- quiz attempts keep the submitted answers for review
alter table academy_quiz_attempts add column if not exists answers jsonb;

-- email log: who/what failed
alter table academy_email_log add column if not exists error text;

-- ---------------------------------------------------------------------------
-- settings used by the online flow (fill in at /admin/settings)
-- ---------------------------------------------------------------------------
insert into academy_settings (key, value) values
  ('upi_payee_name', 'Growtick')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- private bucket for lesson downloads / notes (served via signed URLs)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('academy-files', 'academy-files', false, 52428800)
on conflict (id) do nothing;

-- public bucket for course covers and the UPI QR image
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('academy-public', 'academy-public', true, 5242880,
        array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

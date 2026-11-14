-- Growtick Academy schema (Phase 1: offline flow; Phase 2 adds online learning).
-- All tables are prefixed `academy_` so they can live alongside growtick.in tables
-- in the same Supabase project.
--
-- Apply: npx supabase db push  (or supabase start + supabase db reset locally)
-- Seed:  supabase/seed.sql
--
-- Idempotent: safe to re-run against a partially-applied database.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- helpers: trigger function (defined early so triggers can reference it)
-- ---------------------------------------------------------------------------
create or replace function academy_touch_updated() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table if not exists academy_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  phone text,
  email text,
  role text not null default 'learner' check (role in ('learner', 'admin')),
  created_at timestamptz not null default now()
);

alter table academy_profiles enable row level security;

drop policy if exists "Profiles: readable by the owner" on academy_profiles;
create policy "Profiles: readable by the owner" on academy_profiles
  for select using (auth.uid() = id);
drop policy if exists "Profiles: service role and admins via security-definer functions" on academy_profiles;
create policy "Profiles: service role and admins via security-definer functions" on academy_profiles
  for all using (true);

-- Admin guard: true when the authenticated user's profile has role 'admin'.
-- Needs academy_profiles, so defined right after it.
create or replace function academy_is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role from public.academy_profiles where id = auth.uid()) = 'admin', false)
$$;

-- ---------------------------------------------------------------------------
-- courses
-- ---------------------------------------------------------------------------
create table if not exists academy_courses (
  slug text primary key check (slug ~ '^[a-z0-9-]{2,60}$'),
  title text not null,
  subtitle text,
  description text,
  outcomes jsonb not null default '[]',
  highlights jsonb not null default '[]',
  cover_url text,
  delivery text not null default 'offline' check (delivery in ('offline', 'online', 'both')),
  online_price integer, -- fee in rupees (whole rupees)
  certificate_kind text not null default 'appreciation' check (certificate_kind in ('appreciation', 'completion')),
  pass_mark integer not null default 70 check (pass_mark between 0 and 100),
  status text not null default 'draft' check (status in ('draft', 'published')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table academy_courses enable row level security;

drop policy if exists "Courses: published ones are publicly readable" on academy_courses;
create policy "Courses: published ones are publicly readable" on academy_courses
  for select using (status = 'published');

drop trigger if exists academy_courses_touch on academy_courses;
create trigger academy_courses_touch
  before update on academy_courses
  for each row
  execute function academy_touch_updated();

-- ---------------------------------------------------------------------------
-- batches
-- ---------------------------------------------------------------------------
create table if not exists academy_batches (
  id uuid primary key default gen_random_uuid(),
  course_id text not null references academy_courses (slug) on delete cascade,
  kind text not null default 'offline' check (kind in ('offline', 'live')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  venue text,
  address text,
  map_url text,
  meeting_url text,
  capacity integer not null default 0,
  fee integer not null default 0,
  pay_on_spot boolean not null default true,
  status text not null default 'open' check (status in ('open', 'full', 'closed', 'done')),
  created_at timestamptz not null default now()
);

alter table academy_batches enable row level security;

drop policy if exists "Batches: open ones are publicly readable" on academy_batches;
create policy "Batches: open ones are publicly readable" on academy_batches
  for select using (status = 'open');

-- ---------------------------------------------------------------------------
-- modules / lessons / quiz questions (Phase 2 curriculum; seeded empty)
-- ---------------------------------------------------------------------------
create table if not exists academy_modules (
  id uuid primary key default gen_random_uuid(),
  course_id text not null references academy_courses (slug) on delete cascade,
  title text not null,
  sort_order integer not null default 0
);

alter table academy_modules enable row level security;

drop policy if exists "Modules: of published courses are publicly readable" on academy_modules;
create policy "Modules: of published courses are publicly readable" on academy_modules
  for select using (
    exists (select 1 from academy_courses where slug = course_id and status = 'published')
  );

create table if not exists academy_lessons (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references academy_modules (id) on delete cascade,
  title text not null,
  type text not null default 'video' check (type in ('video', 'reading', 'download', 'quiz', 'live')),
  video_url text,
  body text,
  file_path text,
  duration_min integer,
  is_preview boolean not null default false,
  required boolean not null default true,
  sort_order integer not null default 0
);

alter table academy_lessons enable row level security;

drop policy if exists "Lessons: of published courses are publicly readable" on academy_lessons;
create policy "Lessons: of published courses are publicly readable" on academy_lessons
  for select using (
    exists (
      select 1 from academy_modules m
      join academy_courses c on c.slug = m.course_id
      where m.id = module_id and c.status = 'published'
    )
  );

create table if not exists academy_quiz_questions (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references academy_lessons (id) on delete cascade,
  prompt text not null,
  options jsonb not null default '[]',
  correct_index integer -- never exposed to the browser; graded server-side
);

alter table academy_quiz_questions enable row level security;

-- quiz questions are not public; only admins/service role read them.

-- ---------------------------------------------------------------------------
-- enrollments
-- ---------------------------------------------------------------------------
create table if not exists academy_enrollments (
  id uuid primary key default gen_random_uuid(),
  course_id text not null references academy_courses (slug) on delete cascade,
  batch_id uuid references academy_batches (id) on delete set null,
  user_id uuid references auth.users (id) on delete set null,
  name text not null,
  email text not null,
  phone text,
  mode text not null default 'offline' check (mode in ('offline', 'online')),
  status text not null default 'pending_payment' check (status in ('pending_payment', 'active', 'completed', 'cancelled')),
  payment_method text not null default 'cash' check (payment_method in ('cash', 'upi', 'free')),
  payment_status text not null default 'pending' check (payment_status in ('pending', 'received', 'rejected', 'refunded')),
  amount integer,
  upi_ref text,
  attended_at timestamptz,
  checked_in_by uuid references auth.users (id),
  source text not null default 'web' check (source in ('web', 'import', 'walk-in')),
  reg_code text not null unique,
  created_at timestamptz not null default now()
);

alter table academy_enrollments enable row level security;

drop policy if exists "Enrollments: anyone can register (insert)" on academy_enrollments;
create policy "Enrollments: anyone can register (insert)" on academy_enrollments
  for insert with check (true);

drop policy if exists "Enrollments: learners read their own" on academy_enrollments;
create policy "Enrollments: learners read their own" on academy_enrollments
  for select using (auth.uid() = user_id);

create index if not exists academy_enrollments_batch_idx on academy_enrollments (batch_id);
create index if not exists academy_enrollments_email_idx on academy_enrollments (email);
create index if not exists academy_enrollments_reg_code_idx on academy_enrollments (reg_code);

-- ---------------------------------------------------------------------------
-- progress / attempts (Phase 2)
-- ---------------------------------------------------------------------------
create table if not exists academy_lesson_progress (
  enrollment_id uuid not null references academy_enrollments (id) on delete cascade,
  lesson_id uuid not null references academy_lessons (id) on delete cascade,
  completed_at timestamptz not null default now(),
  primary key (enrollment_id, lesson_id)
);

alter table academy_lesson_progress enable row level security;

drop policy if exists "Admins: progress" on academy_lesson_progress;
create policy "Admins: progress" on academy_lesson_progress for all using (academy_is_admin());

create table if not exists academy_quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references academy_enrollments (id) on delete cascade,
  lesson_id uuid not null references academy_lessons (id) on delete cascade,
  score integer not null,
  passed boolean not null,
  created_at timestamptz not null default now()
);

alter table academy_quiz_attempts enable row level security;

drop policy if exists "Admins: quiz attempts" on academy_quiz_attempts;
create policy "Admins: quiz attempts" on academy_quiz_attempts for all using (academy_is_admin());

-- ---------------------------------------------------------------------------
-- certificates
-- ---------------------------------------------------------------------------
create table if not exists academy_certificates (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null unique references academy_enrollments (id) on delete cascade,
  serial text not null unique,
  verify_code text not null unique,
  pdf_path text,
  issued_at timestamptz not null default now(),
  emailed_at timestamptz,
  revoked boolean not null default false
);

alter table academy_certificates enable row level security;

drop policy if exists "Certificates: verification code is publicly readable" on academy_certificates;
create policy "Certificates: verification code is publicly readable" on academy_certificates
  for select using (true);
drop policy if exists "Certificates: learners read their own" on academy_certificates;
create policy "Certificates: learners read their own" on academy_certificates
  for select using (
    exists (select 1 from academy_enrollments e where e.id = enrollment_id and e.user_id = auth.uid())
  );

create index if not exists academy_certificates_verify_idx on academy_certificates (verify_code);

-- ---------------------------------------------------------------------------
-- email log & settings
-- ---------------------------------------------------------------------------
create table if not exists academy_email_log (
  id uuid primary key default gen_random_uuid(),
  recipient text not null,
  subject text not null,
  template text not null,
  sent_at timestamptz not null default now(),
  status text not null default 'sent'
);

alter table academy_email_log enable row level security;

create table if not exists academy_settings (
  key text primary key,
  value text,
  updated_at timestamptz not null default now()
);

alter table academy_settings enable row level security;

-- ---------------------------------------------------------------------------
-- table privileges: public reads (anon / authenticated) and registration inserts
-- ---------------------------------------------------------------------------
-- RLS policies alone are not enough: the table owner never auto-grants
-- privileges to `anon`/`authenticated`, so every public read failed with
-- "permission denied for table ..." until these grants were added.
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

-- ---------------------------------------------------------------------------
-- admin policies (bypass via security-definer functions above)
-- ---------------------------------------------------------------------------
-- ("Admins: progress" and "Admins: quiz attempts" are defined with their tables above.)
drop policy if exists "Admins: courses" on academy_courses;
create policy "Admins: courses" on academy_courses for all using (academy_is_admin());
drop policy if exists "Admins: batches" on academy_batches;
create policy "Admins: batches" on academy_batches for all using (academy_is_admin());
drop policy if exists "Admins: modules" on academy_modules;
create policy "Admins: modules" on academy_modules for all using (academy_is_admin());
drop policy if exists "Admins: lessons" on academy_lessons;
create policy "Admins: lessons" on academy_lessons for all using (academy_is_admin());
drop policy if exists "Admins: quiz questions" on academy_quiz_questions;
create policy "Admins: quiz questions" on academy_quiz_questions for all using (academy_is_admin());
drop policy if exists "Admins: enrollments" on academy_enrollments;
create policy "Admins: enrollments" on academy_enrollments for all using (academy_is_admin());
drop policy if exists "Admins: certificates" on academy_certificates;
create policy "Admins: certificates" on academy_certificates for all using (academy_is_admin());
drop policy if exists "Admins: email log" on academy_email_log;
create policy "Admins: email log" on academy_email_log for all using (academy_is_admin());
drop policy if exists "Admins: settings" on academy_settings;
create policy "Admins: settings" on academy_settings for all using (academy_is_admin());

-- ---------------------------------------------------------------------------
-- Atomic registration with seat check.
-- Runs as SECURITY DEFINER so an anonymous visitor can register and the
-- capacity check/insert happen in one transaction (no overselling).
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

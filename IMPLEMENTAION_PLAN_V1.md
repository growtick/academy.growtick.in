# Growtick Academy (academy.growtick.in) — implementation plan

## Context

growtick.in already links to `https://academy.growtick.in/` ("Visit Growtick Academy"), but nothing is built there. The only course material is a static poster (`GROWTICK_GST_Compliance_Poster.html`) for an offline GST session on **Sun 15 Nov 2026, 2–5 PM, Chickpet Pathshala Hall, ₹49 pay on the spot**, which registers people through a Google Form.

Goal: a course-only platform (Coursera/Udemy style) where people register, complete a course and receive a certificate, supporting **both offline batches and online courses**, with an admin panel, Supabase for data, and certificates emailed through Resend from `academy@growtick.in`. It must look like growtick.in.

Decisions confirmed with the user:
- **Stack:** Astro + Cloudflare (same as the main site).
- **Launch order:** offline flow first (needed for 15 Nov), online learning second.
- **Online format:** recorded video lessons, live classes, quizzes/final test, notes and downloads.
- **Online payment:** UPI to Growtick's QR + reference number, admin approves. Offline stays cash on the spot.

## What the analysis found

**Main site theme** (inline CSS on growtick.in, to be copied verbatim into `src/styles/tokens.css`):
- Light: `--purple:#6421a6` `--purple-deep:#4b167f` `--violet:#963de0` `--paper:#fbfaff` `--lav:#f1e8fa` `--ink:#17131d` `--muted:#625c6b` `--border:#e9e2ef` `--accent:#be185d`, `--grad:linear-gradient(145deg,#963de0,#45117b)`, `--radius:20px`, `--wrap:72.5rem`, shadows `0 1px 2px #32174b0d, 0 10px 30px #32174b12`.
- Dark (`[data-theme=dark]`): `--bg:#17121f` `--surface:#221a2e` `--text:#ece6f3` `--brand:#c99bf0` `--border:#3a2f4a`; theme chosen before first paint from `localStorage.theme`, else device setting.
- Type: self-hosted Inter variable (`/fonts/inter-latin-wght-normal.woff2`), h1 `clamp(2.25rem,7vw,4.25rem)` with `-.05em` tracking, body `400 1rem/1.6`.
- Components: `.btn` pill (999px, 44px min height, 700 weight) with `--alt` and `--ghost` variants, `.card` (lavender surface, 1px border, 20px radius), `.overline`, `.wrap`, numbered `.steps`.
- Assets to reuse: `/brand/logo-wordmark-light.webp`, `logo-wordmark-dark.webp`, `logo-lockup-dark.webp`, `favicon.svg`.
- Already uses Supabase, Cloudflare Turnstile and a strict CSP. Contact: +91 95130 59059, WhatsApp, Instagram `@growtick.in`.

**Poster content** (becomes the seed data for the first course and batch):
- Title "Master Your GST Compliance", subtitle "A practical, career-ready GST program for students and young professionals."
- Outcomes: Input Tax Credit (ITC) · filing GSTR-1, GSTR-2B and GSTR-3B on time · GST in books, invoicing and e-way bill rules.
- Highlights: expert-led sessions, practical real-world examples, career skills, Certificate of Appreciation.
- Batch: Sun 15 Nov 2026, 2:00–5:00 PM, Chickpet Pathshala Hall, Shri Adinath Jain Temple, Chickpet, Bangalore. Fee ₹49, pay on arrival. Limited seats. Motto "Be GST ready. Be future ready."

## Architecture

- **Astro 5**, `output: 'server'`, `@astrojs/cloudflare` adapter, deployed to Cloudflare Pages on `academy.growtick.in`. TypeScript. Plain CSS with the main site's tokens (no Tailwind, so it matches exactly). Small vanilla-JS islands; no UI framework unless the curriculum builder needs one.
- **Supabase**: Postgres + Auth + Storage. `@supabase/ssr` cookie sessions; `src/middleware.ts` loads the user and guards `/learn`, `/dashboard`, `/admin`.
- **Auth**: email one-time code (Supabase Auth, SMTP pointed at Resend so mails come from `academy@growtick.in`). No passwords to forget. Admin = `profiles.role = 'admin'`.
- **Offline registration needs no login** (people scan a QR at a shop counter): name, mobile, email, consent, Turnstile. If they later sign in with the same email, the registration and certificate appear in their dashboard.
- **Email**: Resend REST API from server endpoints. Templates: registration confirmation, UPI received / approved, live-class reminder, certificate issued. Every send logged.
- **Certificates**: `pdf-lib` (runs on Cloudflare Workers) overlays name, course, date, serial and a verification QR onto the supplied template; PDF stored in a private Storage bucket; emailed as attachment plus link; public check at `/verify/[code]`.
- **Video**: unlisted YouTube via `youtube-nocookie.com` embeds (free, no bandwidth cost). Notes and downloads in Supabase Storage with signed URLs.
- **Secrets** (Cloudflare env, `.env` locally): `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET`. Service-role key is used only in server endpoints.

## Data model (`supabase/migrations/`, all tables prefixed `academy_` so they can live in the existing project)

| Table | Purpose / key columns |
|---|---|
| `profiles` | `id` → auth.users, `full_name`, `phone`, `email`, `role` (learner/admin) |
| `courses` | `slug`, `title`, `subtitle`, `description`, `outcomes` jsonb, `highlights` jsonb, `cover_url`, `delivery` (offline/online/both), `online_price`, `certificate_kind` (appreciation/completion), `pass_mark`, `status` (draft/published) |
| `batches` | `course_id`, `kind` (offline/live), `starts_at`, `ends_at`, `venue`, `address`, `map_url`, `meeting_url`, `capacity`, `fee`, `pay_on_spot`, `status` (open/full/closed/done) |
| `modules`, `lessons` | ordered curriculum; lesson `type` (video/reading/download/quiz/live), `video_url`, `body`, `file_path`, `duration_min`, `is_preview`, `required` |
| `quiz_questions` | `lesson_id`, `prompt`, `options` jsonb, `correct_index` (never sent to the browser; graded server-side) |
| `enrollments` | `course_id`, `batch_id?`, `user_id?`, `name`, `email`, `phone`, `mode`, `status` (pending_payment/active/completed/cancelled), `payment_method` (cash/upi/free), `payment_status`, `amount`, `upi_ref`, `attended_at`, `checked_in_by`, `source` (web/import/walk-in), `reg_code`; unique (`batch_id`,`email`) |
| `lesson_progress`, `quiz_attempts` | per-enrolment completion and scores |
| `certificates` | `enrollment_id`, `serial` (e.g. `GT-GST-2026-0001`), `verify_code`, `pdf_path`, `issued_at`, `emailed_at`, `revoked` |
| `email_log`, `settings` | send history; UPI ID/QR, signatory name, contact numbers |

- RLS on everything: public reads published courses and open batches; learners read their own rows; `is_admin()` (security definer) grants admins full access.
- `register_for_batch()` SQL function does the seat check and insert atomically, so capacity can't be oversold.
- `seed.sql` creates the GST course and the 15 Nov batch from the poster.

## Pages

**Public**
- `/` — hero in the main-site style, featured course, upcoming offline batches, online courses, "how it works" (register → learn → certificate), verify-certificate box, footer linking back to growtick.in.
- `/courses` — catalogue with Online / Offline filter.
- `/courses/[slug]` — Udemy-style detail: outcomes, highlights, curriculum outline, and a sticky enrol card with two tabs: **Attend offline** (batch date, time, venue, map, fee, seats left, register form) and **Learn online** (price, enrol).
- `/courses/[slug]/poster` — the existing poster, cleaned up (embedded images moved to files) with its Enrol links and QR pointing at the course page instead of the Google Form.
- `/registered/[reg_code]` — confirmation with event details and add-to-calendar.
- `/verify` and `/verify/[code]` — certificate authenticity check.
- `/login`, `/privacy`, `/terms`.

**Learner (signed in)**
- `/dashboard` — my courses with progress, upcoming sessions, certificates to download.
- `/learn/[slug]` — curriculum sidebar + player: video, reading, downloads, quiz, live-class join card.
- `/pay/[enrollment]` — UPI QR, amount, reference-number form, "awaiting approval" state.

**Admin (`/admin`, role-guarded)**
- Dashboard: registrations, attendance, pending UPI approvals, certificates issued.
- Courses: create/edit, publish; curriculum builder (modules, lessons, quiz questions, file uploads).
- Batches: create offline or live batches, capacity, open/close.
- Registrations: search/filter, add walk-in, **CSV import** (for the Google Form list), CSV export.
- **Check-in** (phone-friendly, for event day): search by name or mobile, one tap for "Present" and "₹49 received".
- Payments: approve or reject UPI references.
- Certificates: upload template and set field positions with a live preview, bulk-issue to everyone marked present, resend, revoke.
- Learners, email log, settings.
- can create quiz manually or through ai on spot based on some file uploaded like ppt,pdf or anyhting for both online and offline thing

## Certificate rules

- **Offline**: marked present → admin clicks "Issue certificates" for the batch → PDFs generated and emailed.
- **Online**: all required lessons complete **and** final quiz ≥ pass mark (and live session attended if the course has one) → issued and emailed automatically.

## Build order

**Phase 1 — offline flow (target: usable for Sun 15 Nov)**
1. Scaffold Astro + Cloudflare adapter; `tokens.css`, `global.css`, `Base.astro`, header/footer/theme toggle; copy brand assets and Inter font from the main site.
2. Supabase migration + seed; Supabase client helpers and middleware.
3. Home, catalogue, GST course page, offline registration endpoint (Turnstile, seat check), confirmation page and email.
4. Admin login, registrations list, walk-in add, CSV import/export, check-in screen.
5. Certificate generation, storage, email, `/verify`.
6. Poster page repointed at the new registration.

**Phase 2 — online learning**
7. Learner login and dashboard; online enrolment and UPI pay/approve flow.
8. Curriculum builder; lesson player with progress; quizzes graded server-side.
9. Live batches with meeting links, reminders and attendance.
10. Automatic online certificates; remaining admin screens (learners, email log, settings).

## Project layout (new files under `E:\Downloads\Chickpete\academy.growtick.in`)

```
astro.config.mjs  package.json  wrangler.toml  .env.example
public/brand/  public/fonts/  public/posters/
supabase/migrations/0001_academy.sql  supabase/seed.sql
src/styles/{tokens,global}.css
src/layouts/{Base,Admin,Learn}.astro
src/components/{Header,Footer,CourseCard,EnrolCard,BatchInfo,Curriculum,...}.astro
src/lib/{supabase,auth,email,certificate,turnstile,csv}.ts
src/emails/*.ts
src/middleware.ts
src/pages/...            (routes above)
src/pages/api/...        (register, pay, progress, quiz, admin/*)
```

## Needed from you when building starts

1. **Certificate template file** (PDF or PNG) dropped into this folder, plus the signatory name.
2. **Supabase** project URL, anon key and service-role key; confirm whether it is the same project as growtick.in (tables are prefixed `academy_` either way).
3. **Resend API key**, with `growtick.in` verified as a sending domain.
4. **UPI ID / QR image** for online payments.
5. **Turnstile keys** (reuse the main site's or create a new widget).
6. **Admin email address(es)** to grant the admin role.
7. Export of the current **Google Form responses** (CSV) to import.
8. Seat capacity for the 15 Nov batch.

Until the keys arrive, everything is built against `.env.example` placeholders and tested with a local Supabase stack.

## Verification

- `npm run dev`: check home, catalogue and course pages in light and dark mode side by side with growtick.in, at phone and desktop widths.
- Apply the migration and seed (`supabase db reset` locally); confirm RLS by querying as anon, learner and admin.
- Offline end-to-end: register on the GST page → confirmation email arrives from `academy@growtick.in` → appears in admin → check in and mark ₹49 paid → issue certificate → PDF email received → `/verify/[code]` shows valid. Also: duplicate email rejected, full batch rejected, CSV import of sample Google Form rows.
- Online end-to-end: sign in with email code → enrol → submit UPI reference → admin approves → complete lessons and pass quiz → certificate auto-issued; failing the quiz does not issue one.
- Access control: `/admin` and `/learn` redirect when signed out; a learner cannot open admin routes or another learner's certificate.
- `npm run build` and `wrangler pages dev` to confirm it runs on the Cloudflare runtime (pdf-lib and Resend calls included) before deploying.

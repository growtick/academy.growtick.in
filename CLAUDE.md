# Growtick Academy — academy.growtick.in

Offline-first course platform (Astro 5 + Cloudflare Pages + Supabase). Phase 1 = offline GST batch registrations (Sun 15 Nov 2026); Phase 2 = online learning.

## Commands

- `npm run dev` — Astro dev server at localhost:4321. Per AGENTS.md, prefer `astro dev --background`; manage with `astro dev stop | status | logs`.
- `npm run build` — production build (`./dist`).
- `npm run preview` — preview the production build locally.
- `npm run check` — `astro check` (TypeScript).
- `npx wrangler pages dev` — run the build output on the Cloudflare runtime before deploying.
- `npx supabase db push` — apply local migrations to the linked Supabase project (`pbnynqqossnzfuyucqvj`, "Growtick Website"). Requires `supabase login`.
- `psql -f supabase/seed.sql` — seed a local stack (seed.sql is NOT applied by `db push`).

## Environment

Copy `.env.example` to `.env` and fill in Supabase + Resend + Turnstile values. `.env` is never committed. Cloudflare secrets (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `TURNSTILE_SECRET_KEY`, `RESEND_API_KEY`) are set in the Cloudflare dashboard or via `npx wrangler secret put`.

## Structure

- `supabase/migrations/0001_academy.sql` — schema. All tables prefixed `academy_`; RLS enabled everywhere. `0008` Phase 1 fixes + grants, `0009` Phase 2 (column-level anon grants, buckets).
- `supabase/seed.sql` — GST course + 15 Nov batch seed (manual apply).
- `src/lib/supabase.ts` — `anonDb()` (public reads), `userDb(ctx)` (session), `serviceDb()` (server endpoints).
- `src/middleware.ts` — loads session, guards `/admin`, `/dashboard`, `/learn`, `/pay`.
- `src/pages/courses.astro` — catalogue (published courses + open batches).
- `src/pages/courses/[slug].astro` — course detail + offline registration form (posts to `/api/register`).
- `src/pages/api/register.ts` — Turnstile check → `academy_register_for_batch()` RPC → confirmation email via Resend.
- `src/layouts/Base.astro` — site shell with Header/Footer, theme toggle from localStorage. `Admin.astro` wraps it with the admin nav.
- `src/lib/http.ts` — `json`, `one()/many()` (PostgREST embeds can be object OR array — always normalise), `requireAdmin`, `sessionUser`, IST `batchWhen`, `ensureProfile`, `safeNext`.
- `src/lib/{email,certificates,learn,settings,csv}.ts` — Resend templates (+ logging), PDF certificates + online eligibility, curriculum/enrolment loaders, settings, CSV import/export.
- `src/scripts/api-forms.ts` — `form[data-api]` / `button[data-api]` JSON posting used by admin + learner pages.
- Admin: `/admin`, `/admin/registrations` (check-in, walk-in, import, bulk certificates), `/admin/payments`, `/admin/courses[/slug]` (batches + curriculum builder), `/admin/learners`, `/admin/emails`, `/admin/settings`. APIs: `/api/admin/{enrollments,courses,upload,settings,export}`.
- Learner: `/login` (link + 6-digit code), `/dashboard`, `/learn/[slug]`, `/pay/[id]`, `/help`. APIs: `/api/{enroll,pay,profile}`, `/api/learn/{progress,quiz,file,join}`, `/api/auth/{otp,verify,signout}`.
- Guides: `ADMIN_GUIDE.md` (for admins), `/help` page (for learners).
- `src/styles/tokens.css` — growtick.in design tokens copied verbatim; `global.css` imports it.

## Known limitations

- `supabase/seed.sql` must be applied separately after migrations (not pushed by `db push`). Seed the GST course/batch before launch.
- `TURNSTILE_SECRET_KEY` empty → register endpoint skips Turnstile (dev only).
- Migrations 0008/0009 must be pushed for walk-ins, serials, quiz ordering and Phase 2 (see PROGRESS.md).
- Dates are stored UTC; always format with `timeZone: 'Asia/Kolkata'` (use `batchWhen`). Admin datetime inputs are IST.

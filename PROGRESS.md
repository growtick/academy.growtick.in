# Progress — Growtick Academy (academy.growtick.in)

Reference log of what has been done and what remains. Plan: `IMPLEMENTAION_PLAN_V1.md`.

## Done

**Database (root cause of the reported bug)**
- `/courses` returned "Courses are temporarily unavailable" and `/courses/gst-compliance` returned 404 because the `academy_` tables existed on the linked Supabase project (`pbnynqqossnzfuyucqvj`, "Growtick Website`) but had **no table-level privileges granted to `anon`** — every public read failed with `permission denied for table ...`.
- `supabase/migrations/0001_academy.sql`: added idempotent `GRANT` statements (SELECT on public tables for `anon`/`authenticated`, INSERT on `academy_enrollments`, EXECUTE on `academy_register_for_batch`). `0001` was already applied remotely without the grants, so they shipped as separate migrations:
  - `0003_grants.sql` — grants for `anon`/`authenticated`
  - `0004_service_role_grants.sql` — grants for `service_role` (used by server endpoints via `serviceDb()`)
  - `0006_service_role_enrollment_select.sql` — added missing `SELECT` on `academy_enrollments` for `service_role`
- `supabase/migrations/0002_seed.sql`: idempotent seed — GST course `gst-compliance` (published), 15 Nov 2026 batch at Chickpet Pathshala Hall (fee ₹49, open, capacity 60), settings placeholders.
- `npx supabase db push --remote --yes`: applied seed + grants migrations to production. Verified `anon` can read the published course/open batch and `service_role` can read/write backend tables.

**Code**
- `src/pages/index.astro`: removed unused `import { formatInTimeZone } from 'date-fns-tz'` — package not installed, import unused; it broke `npm run build`.
- `npm run build` — completes successfully (Astro + Cloudflare adapter).
- `npm run check` — passes with 0 errors (fixed implicit-any/null types in inline scripts: Header, courses, login, verify, courses/[slug], registered/[reg_code]).
- Dev server running in background mode per AGENTS.md (`astro dev --background`, pid 14092).

**Registration flow (`/api/register` -> `/registered/[reg_code]`)**
- `supabase/migrations/0005_fix_register_function.sql`: fixed `academy_register_for_batch()` — it inserted into `academy_enrollments` without setting `course_id` (NOT NULL), so every registration failed with `null value in column "course_id" ... violates not-null constraint`. The function now looks up `course_id` from the batch and includes it in the insert. Fixed both in `0001` (local/fresh) and `0005` (remote-deployed function).
- End-to-end verified: `POST /api/register` -> `{"ok":true,"reg_code":"GTd75d6986",...}`; enrollment row created with `course_id`, status `active`; `GET /registered/GTd75d6986` -> 200 confirmation page with course, reg code, venue.

**Registration UX fixes (`src/pages/courses/[slug].astro`)**
- Batch radio labels renamed from "Register →" to "Select batch" — the old text looked like a submit button but only selected the batch, so clicking it appeared to do nothing.
- The single open batch is now auto-selected (`checked` on the first radio) so `batch_id` is always sent and users don't get a spurious "Invalid input: batch_id: Required" error.
- The API error handler now shows field-specific messages (e.g. "batch_id: Required", "phone: Enter a valid 10-digit Indian mobile number") instead of generic "Invalid input".
- Verified live: `GET /courses` → 200 with GST course listed; `GET /courses/gst-compliance` → 200 course detail page with ₹49 fee and registration form.

**Docs**
- `README.md` — replaced default Astro starter README with project overview, stack, commands, env vars, DB instructions, page list, layout.
- `CLAUDE.md` — project-level context file (commands, structure, env, known limitations).
- `PROGRESS.md` — this file.

## In progress

(none)

## Next (per IMPLEMENTAION_PLAN_V1.md Phase 1)

1. Admin login + registrations list, walk-in add, CSV import/export, check-in screen (`/admin`).
2. Certificate generation (pdf-lib), storage, email, `/verify/[code]` flow.
3. Poster page `/courses/[slug]/poster` repointed at the new registration.
4. `npm run build` + `npx wrangler pages dev` on Cloudflare runtime before deploying. (`build` verified; `wrangler pages dev` cannot start in this sandbox — workerd `middleware-insertion-facade.js` internal error on two runs, not a code issue. `dist` is valid CF Pages output, ready for `git push` deploy.)
5. Obtain remaining launch items: signatory name, UPI ID/QR, Turnstile secret, admin emails, Google Form export CSV, batch capacity confirmation.

## Notes

- `.env` already contains Supabase + Turnstile + Resend values; `.env.example` has the documented placeholders.
- `supabase/seed.sql` mirrors `0002_seed.sql` for local stacks (`psql -f supabase/seed.sql` after `supabase db reset`).
- Cloudflare server secrets must be set in the dashboard or via `npx wrangler secret put` before deploying.
- `.dev.vars` (gitignored) created locally from `.env` server keys so `wrangler pages dev` can wire API routes when the runtime works.

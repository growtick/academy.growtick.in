# Progress — Growtick Academy (academy.growtick.in)

Reference log of what has been done and what remains. Plan: `IMPLEMENTAION_PLAN_V1.md`. Admin how-to: `ADMIN_GUIDE.md`. Learner how-to: `/help`.

## Status (15 Nov 2026)

- **Phase 1 (offline flow): complete in code.** Registration, confirmation, phone-friendly check-in, cash tracking, walk-ins, CSV import/export, bulk + single certificate issue/resend, `/verify`, poster page.
- **Phase 2 (online learning): complete in code.** Sign-in (link + 6-digit code), dashboard, online enrolment, UPI pay → admin approve/reject, curriculum builder, lesson player (video/reading/download/quiz/live), server-graded quizzes, live-class join + attendance, automatic online certificates, admin learners / payments / email log / settings.

## Deployment (live since 15 Nov 2026)

- Deployed as the **Cloudflare Worker `growtick-academy`** on custom domain **academy.growtick.in** (replaced the old "Coming Soon" page). It is **not** a Pages project, so `git push` does **not** deploy.
- Deploy: `npm run deploy` (= `astro build && wrangler deploy`), logged in to the info.growtick account (`npx wrangler login`).
- Worker secrets set: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `RESEND_FROM`. Change with `npx wrangler secret put NAME`.
- **Missing: `TURNSTILE_SECRET_KEY`** (empty in .env/.dev.vars), so the registration spam check is skipped. Add it with `npx wrangler secret put TURNSTILE_SECRET_KEY` (no redeploy needed).
- Production builds always link to https://academy.growtick.in (`src/lib/site.ts`), even if `.env` says localhost.

## Setup checklist

1. ✅ **Migrations 0008–0010 applied to production** (15 Nov 2026, `npx supabase db push --remote`). Verified: anon can't read lesson content, meeting links, quiz questions or profiles; buckets `academy-files` (private) and `academy-public` exist; GST course set to `completion`; signatory = CA Gaurav K Patiyat.
   - 0008 fixes oversold batches (registration function didn't stop after "batch full"), the profiles data leak, missing service-role grants (certificate `emailed_at`, walk-ins, admin screens) and adds a race-free certificate serial.
   - 0009 hides lesson content / meeting links from the public anon key, adds learner read policies, `sort_order` on quiz questions (the admin course editor and quiz player need it), and creates the `academy-files` (private) and `academy-public` storage buckets.
2. ⏳ **Supabase Auth email template** (Dashboard → Authentication → Email Templates → Magic Link): include `{{ .Token }}` so the email carries the 6-digit code as well as the link. Add `https://academy.growtick.in/auth/callback` to the Auth redirect URL allow-list.
3. **Settings** at `/admin/settings`: UPI ID and UPI QR image (before selling a paid course).
4. ⏳ Make admins (no admin exists yet): `node scripts/make-admin.js <email>` (user must have signed in once).

## Certificate template

`gst-compliance` uses the designed artwork `src/assets/certificates/gst-compliance.jpg` (from `certificate_template.png`). The name is overlaid above the line, serial + verify code bottom-left. Templates are configured per course slug in `TEMPLATES` in `src/lib/certificates.ts` (pixel coordinates); other courses use the generated design. The artwork has the course, date (15 Nov 2026) and signatory printed on it, so a new GST batch on another date needs new artwork.

## Bugs fixed this round (Phase 1)

- Registration function inserted even after returning "batch full"/"not found" (missing `return;`). Also now rejects duplicate email per batch and non-open batches.
- PostgREST returns one-to-one / many-to-one embeds as objects; admin list, `/verify` and certificate code read them as arrays (`x?.[0]`). As a result issued certificates showed "Not issued", course titles fell back to defaults, and the serial prefix was always `CRS`. Fixed via `one()`/`many()` in `src/lib/http.ts`.
- Dates were formatted without a time zone, so on Cloudflare (UTC) 2 PM IST showed as 8:30 AM. Shared IST `batchWhen()`.
- `TURNSTILE_SECRET_KEY` was read via build-time `import.meta.env`, so production could silently skip the spam check. Now `astro:env/server`.
- Sign-in: `redirectTo` → `emailRedirectTo`, and a PKCE cookie client, so `/auth/callback?code=` works. Added code entry, `token_hash` links, profile creation and linking of earlier registrations by email.
- Header theme script toggled the theme on every page load.
- Registration email had a hard-coded date/venue. Google Calendar link was malformed. Course pages read a non-existent `short_description`.
- CSP: inline `style` attributes were blocked in production; now allowed via `style-src-attr 'unsafe-inline'` only.
- Emails now HTML-escape user input and are all logged (with errors) in `academy_email_log`.

## Deferred / not built

- AI-generated quizzes from uploaded PPT/PDF (needs an LLM API key + file parsing).
- Scheduled reminder emails (Pages has no cron). Admin "Send reminder email" button covers it.
- Editing a registrant's name from the admin UI (fix in Supabase before issuing).
- Certificate revoke button (column exists; set `revoked = true` in Supabase).
- Home page hero is still hard-coded to the 15 Nov GST batch.
- Supabase Auth settings (template + redirect URL) were not changed automatically because the project is shared with growtick.in.

## Verification done

- `npm run check`: 0 errors. `npm run build`: passes.
- Dev-server smoke test: public pages 200, unknown course 404, `/admin*`, `/dashboard`, `/learn/*`, `/pay/*`, `/api/learn/file` redirect to `/login` when signed out; admin/learner APIs return 401 signed out. IST times render correctly.
- CSV import unit-checked against a Google-Form-style export (BOM, quoted commas, +91/leading-0 mobiles, duplicate and invalid emails, formula-injection-safe export).
- Not yet exercised end-to-end against the database (needs migrations applied + an admin login): register → check-in → issue; enrol → UPI → approve → lessons → quiz → auto-certificate.

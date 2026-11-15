# Growtick Academy (academy.growtick.in)

Offline-first course platform for Growtick: people browse upcoming offline batches, register without logging in (name, mobile, email, consent), pay on arrival at the venue, and receive a verifiable Certificate of Appreciation after attending. Built to match growtick.in's design and launched in time for the first GST compliance batch on **Sun 15 Nov 2026, 2–5 PM, Chickpet Pathshala Hall, Bangalore**.

## Stack

- **Astro 5** (`output: 'server'`, `@astrojs/cloudflare` adapter) → Cloudflare Pages
- **Supabase** — Postgres + Auth + Storage; tables prefixed `academy_`; RLS everywhere
- **Resend** — email from `academy@growtick.in` (registration confirmations, certificates)
- **Cloudflare Turnstile** — spam protection on registration
- Plain CSS (growtick.in design tokens copied verbatim into `src/styles/tokens.css`), self-hosted Inter font

## Project status

**Phase 1 — offline flow** (usable for 15 Nov): catalogue, GST course page, offline registration with seat check, confirmation page, registration email, certificate verification page, admin guard structure.  
**Phase 2 — online learning**: sign-in, learner dashboard, recorded lessons, notes/downloads, server-graded quizzes, live classes, UPI pay/approve, automatic certificates.

Guides: **`ADMIN_GUIDE.md`** for admins, **`/help`** on the site for learners. Status and setup checklist: `PROGRESS.md`.

See `IMPLEMENTAION_PLAN_V1.md` for the full plan, data model and build order.

## Commands

All run from the project root:

| Command | Action |
|---|---|
| `npm install` | Install dependencies |
| `npm run dev` | Start dev server at localhost:4321 |
| `astro dev --background` | Start dev server in background (preferred per AGENTS.md) |
| `astro dev stop / status / logs` | Manage the background dev server |
| `npm run build` | Build to `./dist` |
| `npm run preview` | Preview the production build locally |
| `npm run check` | `astro check` (TypeScript) |
| `npx wrangler pages dev` | Run the build on the Cloudflare runtime locally |

## Environment

Copy `.env.example` to `.env` (never commit `.env`) and fill in:

```
PUBLIC_SUPABASE_URL=...
PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...   # server/build only
PUBLIC_TURNSTILE_SITE_KEY=...
TURNSTILE_SECRET_KEY=...
RESEND_API_KEY=...
RESEND_FROM="Growtick Academy <academy@growtick.in>"
```

On Cloudflare Pages, set the server secrets (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `TURNSTILE_SECRET_KEY`, `RESEND_API_KEY`) in the dashboard or with `npx wrangler secret put NAME`.

## Database

Migrations live in `supabase/migrations/` (`0001_academy.sql` schema + grants, `0002_seed.sql` GST course/batch seed, `0003_grants.sql` public table privileges). `supabase/seed.sql` is the manual seed for local stacks.

Apply to the linked Supabase project (`pbnynqqossnzfuyucqvj`, "Growtick Website"):

```bash
npx supabase db push --remote --yes
```

Local stack: `npx supabase start` then `npx supabase db reset` and `psql -f supabase/seed.sql`.

## Pages

- `/` — home: featured GST batch, how it works (register → attend → certificate), certificate verify box
- `/courses` — catalogue of published courses with open batches
- `/courses/[slug]` — course detail + offline registration form (posts to `/api/register`)
- `/registered/[reg_code]` — confirmation with batch details and add-to-calendar
- `/verify` and `/verify/[code]` — certificate authenticity check
- `/login`, `/privacy`, `/terms`
- `/help` — learner user guide
- `/courses/[slug]/poster` — printable poster
- `/dashboard`, `/learn/[slug]`, `/pay/[id]` — signed-in learners
- `/admin/*` — admins (registrations & check-in, UPI payments, courses & curriculum, learners, email log, settings)

## Project layout

```
supabase/migrations/   0001_academy.sql, 0002_seed.sql, 0003_grants.sql
supabase/seed.sql      manual seed for local stacks
src/styles/            tokens.css (growtick.in tokens), global.css
src/layouts/Base.astro site shell + Header/Footer + theme toggle
src/components/        Header.astro, Footer.astro
src/lib/supabase.ts    anonDb(), userDb(ctx), serviceDb()
src/middleware.ts      session load + /admin, /dashboard, /learn, /pay guards
src/pages/             routes listed above
src/pages/api/         /api/register (offline registration), /api/auth/otp
```

## Deployment

`npm run deploy` builds and deploys the `growtick-academy` Cloudflare Worker, served on `academy.growtick.in`. `git push` alone does not deploy. Secrets: `npx wrangler secret put NAME`.

## Contacts

WhatsApp: +91 95130 59059 · Instagram: @growtick.in · Main site: https://growtick.in

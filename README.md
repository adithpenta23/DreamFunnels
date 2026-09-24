# DreamFunnels

Funnels, websites and lead-to-appointment systems for agencies and local-service businesses.
Next.js 16 · Supabase · TypeScript · Tailwind v4 · shadcn/ui.

> Status after Sprint 3: email + password auth with app-level rate limiting and a Turnstile
> CAPTCHA, onboarding, multi-tenant workspaces with RLS, agencies that create and manage client
> workspaces, members and roles, email invitations (hashed, expiring, single-use links bound to
> the invited address), transactional email (Resend when hosted, Mailpit locally), an audit log of
> membership changes, a business profile with IANA time zones, personal preferences, the
> dashboard shell and settings. Local/staging/production environments are defined in code.
> Product modules (funnels, websites, CRM, messaging, booking, snapshots, …) are not built yet.

## Quick start

Prerequisites: Node.js ≥ 22.13 (see `.nvmrc`), npm, and Docker (for the local Supabase stack,
which the app and the signed-in E2E tests need).

```bash
npm install
cp .env.example .env.local      # then fill in the Supabase URL and keys (see below)
npm run db:start                # local Supabase: Postgres, Auth, REST, Mailpit
npm run dev                     # http://localhost:3000 → "Start building free" to sign up
```

### Supabase

Pick one:

- **Local stack (recommended)**: needs Docker. `npm run db:start` applies
  `supabase/migrations` and the auth settings in `supabase/config.toml` (8-character passwords,
  email confirmation off so sign-up goes straight to onboarding). Copy the API URL, publishable
  key and secret key from `npx supabase status` into `.env.local` (the secret key also backs the
  auth rate limiter; without it counters live in memory). Leave `APP_ENV` and the Turnstile keys
  empty: the CAPTCHA is off locally. Password-reset emails and invitations appear in Mailpit at
  http://127.0.0.1:54324 (leave the `EMAIL_*` variables empty locally; nothing is sent for real). After pulling new migrations, run `npm run db:reset` (wipes local data)
  or `npx supabase migration up --local` (keeps it).
- **Staging / production**: one Supabase project, Turnstile widget and Vercel environment each,
  with `APP_ENV=staging|production`. Follow `docs/ARCHITECTURE.md` "Deployment": Auth settings
  (Site URL, redirect URL, **Confirm email on**, templates, SMTP, **asymmetric JWT signing keys**),
  a verified Resend sending domain and API key (`EMAIL_PROVIDER=resend`), then the **Deploy
  database** GitHub workflow, which applies migrations and runs
  `npm run verify:hosted`. Staging and production builds refuse to run without their required
  settings.

## Scripts

| Command                   | What it does                                                             |
| ------------------------- | ------------------------------------------------------------------------ |
| `npm run dev`             | Dev server (Turbopack)                                                   |
| `npm run build` / `start` | Production build / serve                                                 |
| `npm run check`           | **All local quality gates**: typecheck, lint, format, tests, build       |
| `npm run typecheck`       | Generate route types and run `tsc --noEmit`                              |
| `npm run lint`            | ESLint, zero warnings allowed                                            |
| `npm run format`          | Prettier write (`format:check` to verify)                                |
| `npm test`                | All Vitest projects: unit, components, db (RLS)                          |
| `npm run test:unit`       | Unit and component tests only                                            |
| `npm run test:db`         | Tenant-isolation (RLS) tests on in-process Postgres (no Docker)          |
| `npm run test:e2e`        | Playwright: smoke + signed-in flows (`test:e2e:install` once first)      |
| `npm run db:*`            | Supabase CLI helpers: `start`, `stop`, `reset`, `migration:new`, `types` |
| `npm run verify:hosted`   | Checks a hosted project's Auth: confirmation on, asymmetric JWT keys     |

## Documentation

- [Architecture](docs/ARCHITECTURE.md): structure, auth and authorization layers, decisions
- [Database](docs/DATABASE.md): schema, RLS model, conventions and templates for new tables
- [QA](docs/QA.md): test strategy, quality gates, Definition of Done

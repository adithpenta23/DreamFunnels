# DreamFunnels

Funnels, websites and lead-to-appointment systems for agencies and local-service businesses.
Next.js 16 · Supabase · TypeScript · Tailwind v4 · shadcn/ui.

> Status after Sprint 4: email + password auth with app-level rate limiting and a Turnstile
> CAPTCHA, onboarding, multi-tenant workspaces with RLS, agencies that create and manage client
> workspaces, members and roles, ownership transfer and "make owner" for clients, leaving a
> workspace, email invitations (hashed, expiring, single-use links bound to the invited address)
> with a pending-invitation list for confirmed accounts, transactional email (Resend when hosted,
> Mailpit locally), an audit log with an owners/admins viewer, a business profile with IANA time
> zones, personal preferences, the dashboard shell and settings. The staging/production pipeline
> (hosted gate, database deploys, staging smoke) is in code; **staging itself hasn't been created
> yet** (`docs/DEPLOYMENT.md`). Product modules (funnels, websites, CRM, messaging, booking,
> snapshots, …) are not built yet.

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
- **Staging / production**: one Supabase project, Resend domain, Turnstile widget and Vercel
  project each, with `APP_ENV=staging|production`. Follow **`docs/DEPLOYMENT.md`**: the Auth
  settings (Site URL, redirect URL, **Confirm email on**, templates, SMTP via Resend,
  **asymmetric JWT signing keys**), the Vercel and GitHub Environment variable names, the
  **Deploy database** workflow (preview, then apply, then `npm run verify:hosted`) and the
  **Staging smoke** workflow. Staging and production builds refuse to run without their required
  settings.

## Scripts

| Command                         | What it does                                                                                    |
| ------------------------------- | ----------------------------------------------------------------------------------------------- |
| `npm run dev`                   | Dev server (Turbopack)                                                                          |
| `npm run build` / `start`       | Production build / serve                                                                        |
| `npm run check`                 | **All local quality gates**: typecheck, lint, format, tests, build                              |
| `npm run typecheck`             | Generate route types and run `tsc --noEmit`                                                     |
| `npm run lint`                  | ESLint, zero warnings allowed                                                                   |
| `npm run format`                | Prettier write (`format:check` to verify)                                                       |
| `npm test`                      | All Vitest projects: unit, components, db (RLS)                                                 |
| `npm run test:unit`             | Unit and component tests only                                                                   |
| `npm run test:db`               | Tenant-isolation (RLS) tests on in-process Postgres (no Docker)                                 |
| `npm run test:e2e`              | Playwright: smoke + signed-in flows (`test:e2e:install` once first)                             |
| `npm run test:e2e:confirmation` | Playwright journeys that need email confirmation on (see docs/QA.md)                            |
| `npm run test:staging`          | The staging smoke (only against the configured staging URL)                                     |
| `npm run db:*`                  | Supabase CLI helpers: `start`, `stop`, `reset` (local), `migration:new`, `types`, `types:check` |
| `npm run verify:hosted`         | The hosted gate: Auth settings, JWT keys, health, headers, callback, …                          |

## Documentation

- [Architecture](docs/ARCHITECTURE.md): structure, auth and authorization layers, decisions
- [Database](docs/DATABASE.md): schema, RLS model, conventions and templates for new tables
- [QA](docs/QA.md): test strategy, quality gates, Definition of Done
- [Deployment](docs/DEPLOYMENT.md): environments, staging setup, releases, hosted verification

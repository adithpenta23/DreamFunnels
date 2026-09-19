# DreamFunnels

AI-native funnel and website builder. Next.js 16 · Supabase · TypeScript · Tailwind v4 · shadcn/ui.

> Status after Sprint 1: email + password auth (sign up, sign in, password reset and change),
> onboarding, multi-tenant workspaces with RLS (create, rename, change URL, switch), the dashboard
> shell and settings. Product modules (funnels, websites, leads, …) are not built yet.

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
  key and secret key from `npx supabase status` into `.env.local`. Password-reset emails appear in
  Mailpit at http://127.0.0.1:54324.
- **Hosted project**: create a project, run `npx supabase link --project-ref <ref>` and
  `npx supabase db push`. Then, in Auth settings: set the Site URL and add
  `<APP_URL>/auth/callback` to the redirect URLs; turn **Confirm email** on; set the minimum
  password length to 8; paste `supabase/templates/*.html` into the email templates; and configure
  custom SMTP (see `docs/ARCHITECTURE.md#deployment`).

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

## Documentation

- [Architecture](docs/ARCHITECTURE.md): structure, auth and authorization layers, decisions
- [Database](docs/DATABASE.md): schema, RLS model, conventions and templates for new tables
- [QA](docs/QA.md): test strategy, quality gates, Definition of Done

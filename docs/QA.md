# QA strategy and quality gates

Goal: every change that merges is typed, linted, tested at the right level, and buildable, with
tenant isolation proven by tests rather than assumed.

## Test pyramid

| Level          | Tool                                           | Location                             | Runs                | What belongs here                                                                             |
| -------------- | ---------------------------------------------- | ------------------------------------ | ------------------- | --------------------------------------------------------------------------------------------- |
| Static         | TypeScript strict, ESLint, Prettier            | whole repo                           | every commit        | Types, unsafe patterns (raw Supabase clients, `console`), formatting.                         |
| Unit           | Vitest (`unit`, node)                          | `src/**/*.test.ts`, next to the code | every commit, ~1s   | Pure logic: schemas, guards, redirects, routing decisions, error mapping, slugs, role rules.  |
| Component      | Vitest (`components`, jsdom) + Testing Library | `src/**/*.test.tsx`                  | every commit        | Client components' behaviour and accessibility (roles and labels, not CSS).                   |
| Database / RLS | Vitest (`db`) + PGlite                         | `supabase/tests/**/*.test.ts`        | every commit, ~2s   | Real migrations and real policies under real roles: isolation, grants, triggers, constraints. |
| E2E smoke      | Playwright (Chromium)                          | `e2e/smoke.spec.ts`                  | every run           | Public surface, guards, validation and error paths. **Needs no Supabase.**                    |
| E2E flows      | Playwright (Chromium) + local Supabase         | `e2e/auth.spec.ts`                   | CI; local w/ Docker | Signed-in journeys through real Auth, PostgREST and RLS: signup → onboarding → dashboard → …  |

Guidelines:

- Test behaviour through public interfaces. Query the DOM by role and label.
- Async Server Components aren't unit-testable in Vitest yet. Cover them with E2E, and keep their
  logic in plain functions that are unit-tested (e.g. `getAuthRedirect`, `authorizeWorkspaceAccess`,
  `pickDefaultWorkspace`, `isRecentRecovery`).
- Mock at boundaries only (`next/navigation`, Server Actions in component tests). Don't mock
  Supabase to "test" authorization; that belongs in the RLS suite or E2E.
- No network in unit, component or db tests. Vitest sets non-secret placeholder `NEXT_PUBLIC_*`
  values (`vitest.config.mts`) so modules that read the public env contract can be imported.

## Tenant-isolation tests (mandatory)

`supabase/tests/tenancy-rls.test.ts` boots PGlite (Postgres 17 in WASM), installs a thin shim of
Supabase's platform (roles `anon`/`authenticated`/`service_role`/`supabase_auth_admin`,
`auth.users`, `auth.uid()`, default grants), applies **every migration in order**, and runs
queries as real roles with real JWT claims.

**Every migration that adds or changes a tenant-owned table must add tests proving:**

1. An outsider can't read the tenant's rows.
2. An outsider can't insert, update or delete them (expect `0` affected rows or a `permission denied` error).
3. Rows can't be moved to another workspace (`UPDATE … SET workspace_id`).
4. Role rules hold (e.g. members can't do admin-only operations).
5. `anon` gets `permission denied`.

The suite is mutation-checked: loosening a policy, dropping the owner-only guard or the
last-owner trigger (Sprint 0), and dropping the reserved-slug constraint, disabling the slug
collision retry or the accent folding (Sprint 1) each made specific tests fail. Keep that
property: a new rule isn't tested until a test fails when the rule is broken.

PGlite limits: it doesn't emulate PostgREST, GoTrue, JWT verification or Storage. Behaviour
that depends on those is covered by `e2e/auth.spec.ts` against a real local Supabase.

## Sprint 1 coverage map

| Requirement                                   | Where it's tested                                                                                                                 |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Signup / login / reset / change validation    | `features/auth/schemas.test.ts`, `login-form.test.tsx`, `signup-form.test.tsx`, smoke                                             |
| Auth error handling (no enumeration, limits)  | `features/auth/lib/auth-errors.test.ts`                                                                                           |
| Protected / guest-only routing, expiry notice | `features/auth/lib/auth-routing.test.ts`, `lib/supabase/session-cookie.test.ts`, smoke                                            |
| Reset only from a recovery link               | `features/auth/lib/recovery.test.ts`, smoke (`/reset-password` anonymous), E2E (ordinary session)                                 |
| Workspace creation / slug validation          | `features/workspaces/schemas.test.ts`, `lib/slug.test.ts`, `onboarding/schemas.test.ts`, RLS suite                                |
| Authorization helpers, membership logic       | `features/workspaces/lib/access.test.ts`, `roles.test.ts`, `last-workspace.test.ts`, RLS suite                                    |
| DB constraint → field error mapping           | `features/workspaces/lib/write-errors.test.ts`, `lib/supabase/db-errors.test.ts`                                                  |
| PostgREST "JWT issued at future" retry        | `lib/supabase/postgrest-retry.test.ts`; E2E signups exercise it against the real stack                                            |
| Shell, switcher, settings forms, app context  | `components/layout/app-shell.test.tsx`, `workspace-switcher.test.tsx`, `workspace-settings-form.test.tsx`, `app-context.test.tsx` |
| Full journey (9 steps) + cross-tenant 404     | `e2e/auth.spec.ts` "a new user signs up, onboards, and keeps the right workspace across sessions"                                 |
| Settings, second workspace, reset, tampering  | `e2e/auth.spec.ts` (remaining tests)                                                                                              |

## Running the suites

```bash
npm run check          # typecheck -> lint -> format:check -> all Vitest projects -> build
npm run test:e2e       # Playwright (starts `next dev` or reuses one on :3000)
```

`e2e/auth.spec.ts` needs a Supabase stack whose URL and keys match `.env.local`:

```bash
npm run db:start       # Docker required; applies supabase/migrations
npx supabase status    # copy API URL, publishable key and secret key into .env.local
npm run test:e2e
```

Without a reachable stack those tests are **skipped** with a message (the smoke suite still runs).
With `E2E_REQUIRE_SUPABASE=1` (set in CI) they **fail** instead, so CI can never pass by skipping.
`SUPABASE_SECRET_KEY` lets the suite read password-reset links (`auth.admin.generateLink`, no
email sent) and delete its test users afterwards; without it the reset test is skipped.

Test users are `e2e-<label>-<id>@example.com` with random ids, so runs don't collide and can run in
parallel. The local stack allows more sign-ins per IP than hosted defaults (`config.toml`), because
every Auth call comes from the Next server's IP.

## Quality gates

### Local (before pushing)

```bash
npm run check
npm run test:e2e       # with `npm run db:start` running for the signed-in flows
```

### CI (GitHub Actions, `.github/workflows/ci.yml`), required to merge

| Job       | Steps                                                                                                                                                                                                 |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `quality` | `npm ci` → `typecheck` → `lint` (zero warnings) → `format:check` → `npm test` (unit + components + db) → `build`                                                                                      |
| `e2e`     | `npm ci` → `supabase start` (Postgres, Auth, REST, Mailpit; our migrations) → export its URL/keys → install Chromium → `build` → `test:e2e` with `E2E_REQUIRE_SUPABASE=1`; report uploaded on failure |

Recommended branch protection on `main`: require both jobs, require up-to-date branches,
no direct pushes.

## Definition of Done (per story)

- [ ] Acceptance criteria met and demoed locally.
- [ ] Input validated with Zod at the boundary. Authorization enforced server-side (guard + RLS).
- [ ] Tests added at the lowest sensible level. New tables have RLS tests (checklist above).
- [ ] Loading, empty and error states handled. No unhandled promise rejections.
- [ ] No secrets or PII in code, logs, analytics events or test fixtures.
- [ ] Migration included, `db:types` regenerated, `docs/DATABASE.md` updated if the schema changed.
- [ ] `docs/ARCHITECTURE.md` updated if a pattern or decision changed.
- [ ] `npm run check` and `npm run test:e2e` green locally. CI green.

## Manual QA checklist (per release)

- Sign up with a new email: with confirmation on, the email arrives and its link (opened on
  another device too) leads to onboarding; with it off, onboarding opens directly.
- Onboarding: leave the URL blank (a URL is generated from the name), try a taken or reserved URL
  (clear error on the field), then land on the new workspace's dashboard.
- Refresh, close and reopen the browser: still signed in. Sign out, then open a workspace URL:
  redirected to login, and returned to it after signing in again.
- Forgot password: the email arrives; the link opens "Choose a new password"; afterwards the old
  password fails, the new one works, and other signed-in devices are signed out.
- Settings: rename the workspace, change its URL (warning shown; old URL now 404s), update your
  name, change your password (wrong current password rejected).
- As a member (not admin), workspace settings are read-only.
- Open another user's workspace URL: "Workspace not found", with no data leaked.
- Check the mobile viewport: navigation sheet (switcher + modules) opens and closes, no horizontal
  scroll. Check keyboard-only use: skip link, focus rings, menus, password visibility toggle.

## Flaky test policy

A flaky test gets fixed or quarantined (`test.fixme` with a linked issue) within one working
day. Don't raise retries or sleep to hide it. Playwright retries (2, CI only) exist to capture
traces, not to excuse flakiness.

## Next steps for QA (backlog)

1. E2E for the email-confirmation path with confirmation enabled, reading the link from the local
   Mailpit API.
2. `supabase db lint` in CI to catch Supabase-specific schema issues PGlite can't see.
3. A CI check that `npm run db:types` produces no diff, so migrations and types can't drift.
4. Coverage reporting (`@vitest/coverage-v8`) with a floor on `src/lib` and `src/features/**/server`.
5. Accessibility checks (`@axe-core/playwright`) on the auth pages, onboarding and settings.
6. Preview-deployment smoke: run `PLAYWRIGHT_BASE_URL=<vercel preview url> npm run test:e2e`.

## Stack notes for E2E

- **PostgREST is pinned to v16.3** via `supabase/.temp/rest-version` (tracked in git; the CLI still
  defaults to v16.2). Older versions sporadically reject a just-issued token with PGRST303
  ("JWT issued at future", PostgREST#5196), which made the sign-up journey flaky. Delete the file
  once the CLI ships ≥ 16.3. `supabase link` rewrites it to match the linked hosted project.
- Local runs use 2 workers (`playwright.config.ts`) because `next dev` compiles routes on demand
  and sign-ups hash passwords in the Auth container. CI uses 1 worker on a production build.
- Menus are opened with a retrying helper (`e2e/support/flows.ts#openMenu`) because a click can
  land before a cold page hydrates.

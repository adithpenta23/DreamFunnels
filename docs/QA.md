# QA strategy and quality gates

Goal: every change that merges is typed, linted, tested at the right level, and buildable, with
tenant isolation proven by tests rather than assumed.

## Test pyramid

| Level          | Tool                                           | Location                                                        | Runs                | What belongs here                                                                                             |
| -------------- | ---------------------------------------------- | --------------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------- |
| Static         | TypeScript strict, ESLint, Prettier            | whole repo                                                      | every commit        | Types, unsafe patterns (raw Supabase clients, `console`), formatting.                                         |
| Unit           | Vitest (`unit`, node)                          | `src/**/*.test.ts`, `scripts/**`                                | every commit, ~1s   | Pure logic: schemas, guards, redirects, error mapping, slugs, roles, rate limits, time zones.                 |
| Component      | Vitest (`components`, jsdom) + Testing Library | `src/**/*.test.tsx`                                             | every commit        | Client components' behaviour and accessibility (roles and labels, not CSS).                                   |
| Database / RLS | Vitest (`db`) + PGlite                         | `supabase/tests/**/*.test.ts`                                   | every commit, ~2s   | Real migrations and real policies under real roles: isolation, grants, triggers, constraints.                 |
| E2E smoke      | Playwright (Chromium)                          | `e2e/smoke.spec.ts`                                             | every run           | Public surface, guards, validation and error paths. **Needs no Supabase.**                                    |
| E2E flows      | Playwright (Chromium) + local Supabase         | `e2e/auth.spec.ts`, `workspaces.spec.ts`, `invitations.spec.ts` | CI; local w/ Docker | Signed-in journeys through real Auth, PostgREST, RLS and email (Mailpit): signup → onboarding → dashboard → … |
| API races      | Playwright (no browser) + local Supabase       | `e2e/invitations-api.spec.ts`                                   | CI; local w/ Docker | Concurrent requests against real Postgres (row locks, unique indexes, triggers).                              |

Guidelines:

- Test behaviour through public interfaces. Query the DOM by role and label.
- Async Server Components aren't unit-testable in Vitest yet. Cover them with E2E, and keep their
  logic in plain functions that are unit-tested (e.g. `getAuthRedirect`, `authorizeWorkspaceAccess`,
  `memberActionsFor`, `isRecentRecovery`).
- Mock at boundaries only (`next/navigation`, Server Actions in component tests). Don't mock
  Supabase to "test" authorization; that belongs in the RLS suite or E2E.
- No network in unit, component or db tests. Vitest sets non-secret placeholder `NEXT_PUBLIC_*`
  values (`vitest.config.mts`) so modules that read the public env contract can be imported.
  External services are faked at their boundary: Turnstile's `siteverify` is a stub `fetch`, the
  Turnstile widget a stub `window.turnstile`, the rate-limit store an in-memory store, the email
  provider `createFakeEmailProvider()` (`src/test/fake-email.ts`), and Resend's and Mailpit's
  HTTP APIs stub `fetch`es.
- In component tests, wait for the committed UI (a closed dialog, a success view, an idle
  button), not for a toast: toasts fire inside the action before React commits its result, and
  asserting right after one races the commit under load.

## Tenant-isolation tests (mandatory)

The suites in `supabase/tests/` boot PGlite (Postgres 17 in WASM), install a thin shim of
Supabase's platform (roles `anon`/`authenticated`/`service_role`/`supabase_auth_admin`,
`auth.users`, `auth.uid()`, default grants), apply **every migration in order**, and run queries
as real roles with real JWT claims. `createTestDb({ stopBefore })` stops before a given migration,
so a test can create data in the old shape and check how the new migration treats it.

| Suite                       | Covers                                                                                                                                     |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `tenancy-rls.test.ts`       | Sprint 0–1: signup, workspace creation, isolation, roles, last owner, profiles.                                                            |
| `agency-hierarchy.test.ts`  | Sprint 2: agency → client access for every role, write policies, no re-parenting, hierarchy constraints, migration of existing workspaces. |
| `profile-fields.test.ts`    | Sprint 2: time zone validation, business profile constraints and permissions, profile preferences.                                         |
| `rate-limits.test.ts`       | Sprint 2: fixed-window counting, window reset, input checks, no access for anon/authenticated.                                             |
| `invitations.test.ts`       | Sprint 3: the 17 required invitation scenarios (numbered), token lifecycle, preview, acceptance outcomes, last owner, audit log.           |
| `client-workspaces.test.ts` | Sprint 3: who may create clients, parent derivation, clean start, slugs and names, profile constraints, website grant, audit.              |

**Every migration that adds or changes a tenant-owned table must add tests proving:**

1. An outsider can't read the tenant's rows.
2. An outsider can't insert, update or delete them (expect `0` affected rows or a `permission denied` error).
3. Rows can't be moved to another workspace (`UPDATE … SET workspace_id`).
4. Role rules hold (e.g. members can't do admin-only operations).
5. `anon` gets `permission denied`.

The suite is mutation-checked: loosening a policy, dropping the owner-only guard or the
last-owner trigger (Sprint 0), and dropping the reserved-slug constraint, disabling the slug
collision retry or the accent folding (Sprint 1) each made specific tests fail. Sprint 2 repeated
this for 14 mutations, each caught by at least one test: agency members inheriting access,
client members reaching their parent, agency members getting an inherited role, the
hierarchy columns granted to users, the hierarchy CHECK dropped, no inherited role at all, the
parent key cascading deletes, offsets or `Etc/` zones accepted as time zones, the limiter RPC or
its table opened to users, windows that never reset, a role check that ignores the minimum role,
and a widened profile grant. Sprint 3 repeated it for 22 mutations of its migration, each
caught: no email match, no expiry, revoked or verified-email check on acceptance; acceptance
callable by anon or reusable by someone else; members allowed to invite; owner invitations; no
"already a member" check; expired invitations not reissued; several open invitations per
address; members reading invitations; the token hash readable; resend not rotating the token;
resend/revoke ignoring the workspace; stale delivery results applied; the accepted workspace's
URL shown to anyone; clients under any workspace or created by agency members; duplicate client
names; the membership audit trigger dropped; the audit log readable by users. Keep that
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

## Sprint 2 coverage map

| Requirement                                         | Where it's tested                                                                                                       |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Agency/client access rules (12 required scenarios)  | `supabase/tests/agency-hierarchy.test.ts` (numbered 1–12); E2E `workspaces.spec.ts` "agency owners reach their clients" |
| Hierarchy invariants, delete behaviour, migration   | `agency-hierarchy.test.ts` "11." and "12."; the migration also ran against the existing local database                  |
| Time zones (IANA only, canonical, labels, DST)      | `lib/timezones.test.ts`, `profile-fields.test.ts`, E2E (picker, Denver browser seeds Mountain Time)                     |
| Business profile (validation, normalising, roles)   | `workspaces/schemas` via the form + `profile-fields.test.ts`, `workspace-profile-form.test.tsx`, E2E                    |
| Profile phone, time zone, locale                    | `account/schemas.test.ts`, `profile-fields.test.ts`, E2E                                                                |
| Rate limiting (core, stores, IPs, auth wiring)      | `lib/rate-limit/core.test.ts`, `lib/request-ip.test.ts`, `rate-limits.test.ts`, E2E "sign-in attempts are rate-limited" |
| CAPTCHA (verification, widget, form gating)         | `lib/captcha/turnstile.test.ts`, `turnstile-widget.test.tsx`, `signup-form.test.tsx`                                    |
| Environment rules (APP_ENV, hosted requirements)    | `lib/env/schema.test.ts`; `APP_ENV=staging next build` fails listing the missing settings                               |
| Hosted Auth checks (confirmation, JWT signing keys) | `scripts/verify-hosted-auth.test.ts`; run against the local stack (reports confirmation off, EC key present)            |
| Searchable select (search, keyboard, clear)         | `components/forms/searchable-select.test.tsx`, E2E                                                                      |

## Sprint 3 coverage map

| Requirement                                              | Where it's tested                                                                                                                                                               |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Invitation RLS and functions (the 17 required scenarios) | `supabase/tests/invitations.test.ts`, numbered 1–17; scenario 13 (true concurrency) in `e2e/invitations-api.spec.ts`                                                            |
| Client creation: authority, parent, clean start, slugs   | `supabase/tests/client-workspaces.test.ts`; E2E journey 1; slug collisions under concurrency in `invitations-api.spec.ts`                                                       |
| Concurrency (invites, accepts, owners, remove vs role)   | `e2e/invitations-api.spec.ts` (real Postgres through PostgREST)                                                                                                                 |
| Tokens, hashing, redaction, confirmation hop             | `features/invitations/lib/tokens.test.ts`                                                                                                                                       |
| Invitation state and expiry display                      | `features/invitations/lib/display.test.ts`                                                                                                                                      |
| Email normalisation, roles, form validation              | `features/invitations/schemas.test.ts`, `features/workspaces/schemas.test.ts`                                                                                                   |
| Member permissions, last-owner messages                  | `features/workspaces/lib/members.test.ts`; DB suite 14; E2E journeys 6–7                                                                                                        |
| Error mapping (invitations, accept outcomes)             | `features/invitations/lib/errors.test.ts`                                                                                                                                       |
| Rate limits for invitations                              | `features/invitations/server/rate-limits.test.ts`                                                                                                                               |
| Email: template, variables, escaping, providers, service | `features/email/templates/invitation.test.ts`, `features/email/server/send.test.ts`, `lib/email/resend.test.ts`, `mailpit.test.ts`, `features/invitations/server/email.test.ts` |
| Email env rules (local/staging/production)               | `lib/env/schema.test.ts`                                                                                                                                                        |
| Invite dialog, member list, role change, removal, revoke | `invite-member-dialog.test.tsx`, `members-list.test.tsx`, `pending-invitations.test.tsx`                                                                                        |
| Accept form, add-client form, switcher, invited sign-up  | `accept-invitation-form.test.tsx`, `create-client-form.test.tsx`, `workspace-switcher.test.tsx`, `signup-form.test.tsx`                                                         |
| Journeys 1–7, resend/revoke/expiry, page caching         | `e2e/invitations.spec.ts` (emails read from Mailpit)                                                                                                                            |

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

The app's own auth rate limits are per client IP, so each browser context sends a random
`X-Forwarded-For` from 198.18.0.0/15 (per worker in `playwright.config.ts`, per test via
`giveEachTestItsOwnIp()`): tests and repeated local runs don't spend each other's budget, and the
rate-limit test gets a clean one. `next dev`/`next start` keep a client-supplied header; Vercel
overwrites it, so runs against a preview deployment share the runner's real IP and its limits.
The CAPTCHA is off in E2E (no Turnstile keys), so no test depends on Cloudflare.

Email in E2E goes to the stack's **Mailpit** (the app's default provider locally and in CI; set
`MAILPIT_URL` if it isn't on `127.0.0.1:54324`). `e2e/support/mailpit.ts` waits for a message to
an address through Mailpit's API and extracts the invitation link, and each spec deletes the
messages it read. No test talks to Resend. Users a journey only needs to exist are created
through the admin API (`createConfirmedUser`), which is faster than the sign-up form and doesn't
spend the per-IP sign-up budget; extra browser contexts get their own `x-forwarded-for`.

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
- Business profile (as owner/admin): search the time zone picker by city ("chicago"), by IANA id
  ("america/") and with the keyboard only (type, arrows, Enter, Escape); save a phone typed as
  "(512) 555-0100" without a country code (rejected on the field) and "+1 512 555 0100" (saved as
  +15125550100); pick colours with the swatch and by typing; clear the country; reload and see
  everything kept. As a member, the section is read-only. Check the mobile layout.
- Staging only: sign-up and forgot-password show the Turnstile widget, the button waits for it,
  and a sign-up with the widget blocked by an extension fails with the generic message. Eleven
  wrong passwords for one email within 15 minutes end in "Too many attempts".
- Staging and production: `npm run verify:hosted` passes (the deploy-database workflow runs it).
- Clients (agency owner): Clients in the sidebar; empty state; "Add client" with an owner email
  (the summary says who gets invited); success screen; the client in the list as "Invitation
  pending"; open it (switcher says "Client of …"); search by name. As an agency member: no
  Clients link, and `/clients` explains why. Check 375px width: no sideways scroll.
- Members: invite (email arrives: Mailpit locally, a real inbox on staging, with the right
  workspace, role, expiry and link); invite the same address again (resend or cancel offered);
  resend (old link says "isn't valid"); revoke (link says "cancelled"); change a role; remove
  someone (they get "Workspace not found", their account still works). As a member: read-only.
- Invitation page: open a link signed out (sign in / create account), signed in as someone else
  ("different account", sign out and continue), and as the invitee (accept, asked for a name if
  new). Staging: create an account from an invitation, confirm the email **in the same
  browser**, and land back on the invitation.

## Flaky test policy

A flaky test gets fixed or quarantined (`test.fixme` with a linked issue) within one working
day. Don't raise retries or sleep to hide it. Playwright retries (2, CI only) exist to capture
traces, not to excuse flakiness.

## Next steps for QA (backlog)

1. E2E for the email-confirmation path with confirmation enabled, reading the link from the local
   Mailpit API (the path staging and production use), including sign-up from an invitation
   (the `df_pending_invitation` hop; today unit-tested and on the manual checklist).
2. `supabase db lint` in CI to catch Supabase-specific schema issues PGlite can't see.
3. A CI check that `npm run db:types` produces no diff, so migrations and types can't drift.
4. Coverage reporting (`@vitest/coverage-v8`) with a floor on `src/lib` and `src/features/**/server`.
5. Accessibility checks (`@axe-core/playwright`) on the auth pages, onboarding and settings.
6. Preview-deployment smoke: run `PLAYWRIGHT_BASE_URL=<vercel preview url> npm run test:e2e`.
7. Staging E2E with Cloudflare's always-pass Turnstile keys, to exercise the real widget and
   `siteverify` path end to end.

## Stack notes for E2E

- **PostgREST is pinned to v16.3** via `supabase/.temp/rest-version` (tracked in git; the CLI still
  defaults to v16.2). Older versions sporadically reject a just-issued token with PGRST303
  ("JWT issued at future", PostgREST#5196), which made the sign-up journey flaky. Delete the file
  once the CLI ships ≥ 16.3. `supabase link` rewrites it to match the linked hosted project.
- Local runs use 2 workers (`playwright.config.ts`) because `next dev` compiles routes on demand
  and sign-ups hash passwords in the Auth container. CI uses 1 worker on a production build.
- Menus are opened with a retrying helper (`e2e/support/flows.ts#openMenu`) because a click can
  land before a cold page hydrates.
- Component tests open the searchable select with ArrowDown: jsdom's synthetic typing doesn't open
  Base UI's Combobox (real keyboards do; E2E types into it). While it's open, Base UI hides the rest
  of the page from assistive tech, so keep a reference to the input rather than re-querying it by
  role.
- A test that submits the same form repeatedly must wait for each action to settle (e.g. the
  password field being cleared) before typing again, or the pending action's form reset can wipe
  the next attempt's input.

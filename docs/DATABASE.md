# Database

Supabase Postgres 17. The schema's source of truth is `supabase/migrations/`; this document
explains it. So far there is only the tenancy core (profiles, workspaces, memberships); product
tables arrive with their features.

| Migration                                          | Sprint | What it does                                                                                          |
| -------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------- |
| `20260918000000_tenancy_foundation.sql`            | 0      | Tables, RLS, grants, private helpers, triggers, `create_workspace()`.                                 |
| `20260918120000_onboarding_workspace_creation.sql` | 1      | Signup creates the profile only; `create_workspace()` can generate the slug; reserved slugs rejected. |

## Schema

```mermaid
erDiagram
  AUTH_USERS ||--|| PROFILES : "1:1 (trigger)"
  PROFILES ||--o{ WORKSPACE_MEMBERS : "belongs to"
  WORKSPACES ||--o{ WORKSPACE_MEMBERS : "has"
  PROFILES |o--o{ WORKSPACES : "created_by"

  PROFILES {
    uuid id PK "= auth.users.id"
    text email "mirrored from auth.users"
    text full_name
    text avatar_url
    timestamptz created_at
    timestamptz updated_at
  }
  WORKSPACES {
    uuid id PK
    text name "1-80 chars"
    text slug UK "3-48, [a-z0-9-], not reserved"
    uuid created_by FK "nullable"
    timestamptz created_at
    timestamptz updated_at
  }
  WORKSPACE_MEMBERS {
    uuid workspace_id PK, FK
    uuid user_id PK, FK
    workspace_role role "member | admin | owner"
    timestamptz created_at
    timestamptz updated_at
  }
```

| Object                         | Purpose                                                                                              |
| ------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `public.profiles`              | App-facing user data, one row per `auth.users` row. Never duplicate auth data beyond display fields. |
| `public.workspaces`            | The tenant. Everything a customer owns will reference one. Created in onboarding, not at signup.     |
| `public.workspace_members`     | Membership and role. Composite PK `(workspace_id, user_id)`, plus an index on `user_id`.             |
| `public.workspace_role` (enum) | `member < admin < owner`. Declaration order is privilege order; comparisons rely on it.              |
| `private` schema               | Not exposed through the Data API. Holds SECURITY DEFINER helpers and trigger functions.              |

### Functions and triggers

| Name                                       | Kind                                 | Behaviour                                                                                                  |
| ------------------------------------------ | ------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `private.user_workspace_ids()`             | helper, definer                      | Returns the set of workspace ids the current user (`auth.uid()`) belongs to.                               |
| `private.has_workspace_role(ws, min_role)` | helper, definer                      | True when the caller holds at least `min_role` in `ws`.                                                    |
| `public.create_workspace(name, slug?)`     | RPC, definer                         | Creates a workspace and makes the caller owner, atomically. The only client path to create one. See below. |
| `private.handle_new_user()`                | trigger on `auth.users` insert       | Creates the profile only (display fields from metadata, clipped to the column limits).                     |
| `private.slugify(text)`                    | helper, immutable                    | `'Café Münster & Co.'` → `'cafe-munster-co'`: NFKD accent folding, then non-alphanumerics → `-`.           |
| `private.is_reserved_workspace_slug(text)` | helper, immutable                    | True for slugs kept for routes and subdomains (`www`, `app`, `api`, `admin`, `settings`, …).               |
| `private.handle_user_email_change()`       | trigger on `auth.users` email update | Keeps `profiles.email` in sync.                                                                            |
| `private.protect_last_owner()`             | trigger on `workspace_members`       | Blocks demoting or removing the last owner, and locks the workspace row to prevent races. Allows cascades. |
| `private.set_updated_at()`                 | trigger                              | Maintains `updated_at` on every table.                                                                     |

All definer functions pin `search_path = ''` and schema-qualify every reference.

### Constraints on `workspaces.slug`

| Constraint                     | Rule                                             | App message (field `workspaceSlug`) |
| ------------------------------ | ------------------------------------------------ | ----------------------------------- |
| `workspaces_slug_check`        | `^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$` (3–48 chars) | "Use 3–48 lowercase letters, …"     |
| `workspaces_slug_key` (unique) | Globally unique                                  | "That URL is already taken."        |
| `workspaces_slug_not_reserved` | `not private.is_reserved_workspace_slug(slug)`   | "That URL is reserved."             |

Each is mirrored in `src/features/workspaces/lib/slug.ts` and `schemas.ts` so forms reject bad
input early, but the database is the final judge (`lib/write-errors.ts` maps violations to field
errors). CHECK constraints run their functions as the writing role, which is why `authenticated`
and `service_role` have `EXECUTE` on `is_reserved_workspace_slug`.

### `create_workspace(p_name, p_slug default null)`

- `p_slug` given: used as is; constraint errors reach the caller (`23514` invalid/reserved,
  `23505` taken).
- `p_slug` null or blank: the base is `slugify(name)` cut to 40 characters (room for a suffix).
  The plain base is tried first, unless it's shorter than 3 characters, reserved or empty (then
  `workspace`). On a collision it retries with a random `-xxxxxx` suffix, up to 5 attempts.
- Always inserts the owner membership for `auth.uid()` in the same transaction.

Generating the slug in SQL is deliberate: RLS hides other tenants' workspaces, so the app can't
check availability without a lookup endpoint that would leak which slugs exist.

## Workspace and membership model

- A user can belong to any number of workspaces; each membership has one role
  (`member < admin < owner`). The creator of a workspace is its owner.
- **Onboarding invariant**: a user with no membership is sent to onboarding. Signup no longer
  creates a workspace, so the first one is always named by the user.
- A workspace always keeps at least one owner (`protect_last_owner` trigger).
- Memberships are created only by definer functions: `create_workspace()` today,
  `accept_invitation()` for team members next. There is no `INSERT` grant, so nobody can add
  themselves or anyone else directly.
- Roles are enforced by RLS: members read; admins rename and change the URL; owners delete and
  manage ownership.

## Access model

Grants are least-privilege. RLS then limits _which rows_ a granted verb can touch.

| Table               | `anon` | `authenticated` grants                     | RLS policy (authenticated)                                                                                                |
| ------------------- | ------ | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `profiles`          | none   | `SELECT`; `UPDATE (full_name, avatar_url)` | Read self and co-members of any shared workspace. Update self only.                                                       |
| `workspaces`        | none   | `SELECT`; `UPDATE (name, slug)`; `DELETE`  | Read if member. Update if admin or above. Delete if owner. No `INSERT` (use `create_workspace`).                          |
| `workspace_members` | none   | `SELECT`; `UPDATE (role)`; `DELETE`        | Read co-members. Admins change roles and remove members, but only owners touch owner rows. Anyone can leave. No `INSERT`. |

`service_role` (the secret key) bypasses RLS. See the admin-client rules in `ARCHITECTURE.md`.

**Why no INSERT on memberships?** Direct inserts would let an admin add any user id to their
workspace without consent. Memberships are created only by trusted functions:
`create_workspace` and the planned `accept_invitation`.

## Conventions for new tables

1. **Tenant-owned data** gets `workspace_id uuid not null references public.workspaces (id) on delete cascade`,
   an index that leads with `workspace_id`, and the standard policies below.
2. Primary keys are `uuid default gen_random_uuid()`. Timestamps are `timestamptz`, with
   `created_at`/`updated_at` plus the `private.set_updated_at()` trigger.
3. Enable RLS in the **same migration** that creates the table, with explicit grants.
4. Check constraints for invariants (lengths, formats). Mirror them in the feature's Zod schema.
5. `jsonb` is for documents with their own versioned schema (e.g. page content), not for
   avoiding modelling. Add a `schema_version int not null` next to it.
6. Soft deletes only when there's a product need (e.g. restore). Otherwise cascade.
7. Add RLS tests to `supabase/tests/` in the same PR (see `docs/QA.md`).

### Template: tenant-scoped table

```sql
create table public.funnels (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index funnels_workspace_id_idx on public.funnels (workspace_id);

create trigger funnels_set_updated_at
  before update on public.funnels
  for each row execute function private.set_updated_at();

alter table public.funnels enable row level security;

create policy "funnels: members can read"
  on public.funnels for select to authenticated
  using (workspace_id in (select private.user_workspace_ids()));

create policy "funnels: members can create"
  on public.funnels for insert to authenticated
  with check (workspace_id in (select private.user_workspace_ids()));

create policy "funnels: members can update"
  on public.funnels for update to authenticated
  using (workspace_id in (select private.user_workspace_ids()))
  with check (workspace_id in (select private.user_workspace_ids()));

create policy "funnels: admins can delete"
  on public.funnels for delete to authenticated
  using (private.has_workspace_role(workspace_id, 'admin'));

revoke all on table public.funnels from anon, authenticated;
grant select, insert, delete on table public.funnels to authenticated;
grant update (name) on table public.funnels to authenticated;
grant all on table public.funnels to service_role;
```

Notes:

- `workspace_id in (select private.user_workspace_ids())` is evaluated once per statement, not
  per row. Keep that form for large tables.
- Only `UPDATE (name)` is granted, so `workspace_id` can't be changed at all and rows can't
  move between tenants. The `WITH CHECK` is a second line of defence if a broader grant is ever
  added.

## Migration workflow

```bash
npm run db:start                       # local Supabase (Docker required)
npm run db:migration:new add_funnels   # creates supabase/migrations/<timestamp>_add_funnels.sql
# write SQL, then:
npm run db:reset                       # re-applies all migrations + seed.sql locally
npm run test:db                        # RLS suite on PGlite (no Docker needed)
npm run db:types                       # regenerate src/types/database.types.ts
```

> `src/types/database.types.ts` is generated (first regenerated in Sprint 1; it matched the
> earlier hand-written version). Never edit it by hand: change the migration, then regenerate.

- Migrations are append-only once merged. Fix mistakes with a new migration.
- Keep migrations deterministic and idempotent where cheap (`if not exists` on extensions and schemas).
- Deploy with `supabase link --project-ref <ref>` and `supabase db push`, from CI or a release
  step, staging before production.
- Destructive changes (drop or rename column) take two releases: stop using it, then drop it.

## Future extension points

These are anticipated tables, sketched so that today's decisions don't block them. They are not built.

| Area            | Likely tables                                             | Notes                                                                                                                  |
| --------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Invitations     | `workspace_invitations`                                   | Hashed token, email, role, expiry; `accept_invitation(token)` definer function inserts membership. Next up (Sprint 2). |
| Funnels & pages | `funnels`, `funnel_steps`, `pages`, `page_versions`       | `pages.content jsonb` + `schema_version`. Versions are immutable snapshots; publishing points at one.                  |
| Publishing      | `sites`, `site_deployments`                               | Public reads through a definer function or view that exposes only published snapshots.                                 |
| Custom domains  | `domains`                                                 | Globally unique hostname, verification status, workspace-scoped management.                                            |
| Forms           | `forms`, `form_submissions`                               | Anonymous submissions go through a definer function, rate-limited, never with a blanket `anon` grant.                  |
| Contacts        | `contacts`, `contact_events`, `tags`                      | Unique `(workspace_id, lower(email))`, with high-volume indexes led by `workspace_id`.                                 |
| Email           | `email_campaigns`, `email_messages`, `email_suppressions` | Provider message ids plus webhook-driven status updates.                                                               |
| Automations     | `automations`, `automation_runs`, `jobs`                  | Postgres-backed job queue first (Supabase Queues / `pg_cron`).                                                         |
| AI              | `ai_generations`, `ai_usage`                              | Prompts and outputs are auditable, with usage metered per workspace for billing.                                       |
| Billing         | `billing_customers`, `subscriptions`, `plan_limits`       | Written only by Stripe webhooks (service role); read by members.                                                       |
| Audit           | `audit_log`                                               | Append-only, written by triggers or definer functions.                                                                 |

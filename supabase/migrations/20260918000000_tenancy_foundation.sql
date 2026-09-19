-- =============================================================================
-- Tenancy foundation
--
-- Creates the multi-tenant core that every future product table hangs off:
--   * public.profiles          one row per auth user (app-facing user data)
--   * public.workspaces        the tenant boundary
--   * public.workspace_members who belongs to which workspace, with a role
--
-- Security model (see docs/DATABASE.md):
--   * RLS is enabled on every table. No policy = no access.
--   * Least-privilege grants: anon gets nothing; authenticated gets only the
--     columns/verbs it needs. RLS then scopes rows to the caller's workspaces.
--   * Membership checks live in SECURITY DEFINER helpers in the non-exposed
--     `private` schema, which avoids RLS recursion and keeps them off the API.
--   * Workspaces and memberships are only created through trusted functions
--     (signup trigger, public.create_workspace) so a workspace can never exist
--     without an owner and users can't be added to workspaces without consent.
-- =============================================================================

create schema if not exists private;

-- -----------------------------------------------------------------------------
-- Types
-- -----------------------------------------------------------------------------

-- Declaration order is privilege order (member < admin < owner); role checks
-- compare enum values directly. Insert new roles with ADD VALUE ... BEFORE/AFTER
-- to keep the ordering meaningful. Mirrored in src/features/workspaces/lib/roles.ts.
create type public.workspace_role as enum ('member', 'admin', 'owner');

-- -----------------------------------------------------------------------------
-- Tables
-- -----------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  -- Mirrored from auth.users by trigger; read-only for clients.
  email text,
  full_name text check (char_length(full_name) <= 120),
  avatar_url text check (char_length(avatar_url) <= 2048),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'Application-level user data. One row per auth.users row, created by trigger on signup.';

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  -- 3-48 chars, lowercase alphanumerics and hyphens, no leading/trailing hyphen.
  -- Mirrored in src/features/workspaces/schemas.ts.
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$'),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.workspaces is 'Tenant boundary. Every tenant-owned row must reference a workspace.';

create index workspaces_created_by_idx on public.workspaces (created_by);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.workspace_role not null default 'member',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

comment on table public.workspace_members is 'Workspace membership and role. The source of truth for tenant access.';

-- The PK covers lookups by workspace; this covers "which workspaces am I in?".
create index workspace_members_user_id_idx on public.workspace_members (user_id);

-- -----------------------------------------------------------------------------
-- Authorization helpers (SECURITY DEFINER, non-exposed schema)
-- -----------------------------------------------------------------------------

-- Workspaces the current user belongs to. Use in policies as
--   workspace_id in (select private.user_workspace_ids())
-- which Postgres evaluates once per statement rather than once per row.
create function private.user_workspace_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.workspace_id
  from public.workspace_members m
  where m.user_id = (select auth.uid());
$$;

-- True when the current user holds at least p_min_role in the workspace.
create function private.has_workspace_role(
  p_workspace_id uuid,
  p_min_role public.workspace_role
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_members m
    where m.workspace_id = p_workspace_id
      and m.user_id = (select auth.uid())
      and m.role >= p_min_role
  );
$$;

-- -----------------------------------------------------------------------------
-- Triggers
-- -----------------------------------------------------------------------------

create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();

create trigger workspaces_set_updated_at
  before update on public.workspaces
  for each row execute function private.set_updated_at();

create trigger workspace_members_set_updated_at
  before update on public.workspace_members
  for each row execute function private.set_updated_at();

-- A workspace must always keep at least one owner. Cascading deletes (the
-- workspace or the user's profile being deleted) are allowed through.
create function private.protect_last_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if old.role <> 'owner' or new.role = 'owner' then
      return new;
    end if;
  else
    if old.role <> 'owner' then
      return old;
    end if;
    if not exists (select 1 from public.workspaces w where w.id = old.workspace_id)
      or not exists (select 1 from public.profiles p where p.id = old.user_id) then
      return old;
    end if;
  end if;

  -- Serialize ownership changes per workspace so two owners can't demote
  -- each other concurrently and leave the workspace ownerless.
  perform 1 from public.workspaces w where w.id = old.workspace_id for update;

  if not exists (
    select 1
    from public.workspace_members m
    where m.workspace_id = old.workspace_id
      and m.role = 'owner'
      and m.user_id <> old.user_id
  ) then
    raise exception 'A workspace must have at least one owner'
      using errcode = 'P0001', hint = 'Transfer ownership before leaving or demoting the last owner.';
  end if;

  if tg_op = 'UPDATE' then
    return new;
  end if;
  return old;
end;
$$;

create trigger workspace_members_protect_last_owner
  before update of role or delete on public.workspace_members
  for each row execute function private.protect_last_owner();

-- Provision every new user with a profile and a personal workspace they own.
-- Runs inside the auth.users insert: if it fails, signup fails, so keep it
-- simple and deterministic.
create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_local_part text := split_part(coalesce(new.email, ''), '@', 1);
  v_full_name text := nullif(btrim(new.raw_user_meta_data ->> 'full_name'), '');
  v_base_slug text;
  v_slug text;
  v_workspace_id uuid;
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    left(v_full_name, 120),
    nullif(btrim(new.raw_user_meta_data ->> 'avatar_url'), '')
  );

  v_base_slug := left(
    trim(both '-' from regexp_replace(lower(v_local_part), '[^a-z0-9]+', '-', 'g')),
    30
  );
  if v_base_slug = '' then
    v_base_slug := 'workspace';
  end if;

  loop
    v_slug := v_base_slug || '-' || substr(md5(random()::text || clock_timestamp()::text), 1, 6);
    exit when not exists (select 1 from public.workspaces w where w.slug = v_slug);
  end loop;

  insert into public.workspaces (name, slug, created_by)
  values (
    left(coalesce(v_full_name, nullif(v_local_part, ''), 'My'), 60) || '''s workspace',
    v_slug,
    new.id
  )
  returning id into v_workspace_id;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (v_workspace_id, new.id, 'owner');

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

create function private.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function private.handle_user_email_change();

-- -----------------------------------------------------------------------------
-- Public API functions
-- -----------------------------------------------------------------------------

-- Creates a workspace and makes the caller its owner in one transaction.
-- This is the only way for clients to create workspaces (there is no INSERT
-- grant on public.workspaces).
create function public.create_workspace(p_name text, p_slug text)
returns public.workspaces
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_workspace public.workspaces;
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  insert into public.workspaces (name, slug, created_by)
  values (btrim(p_name), p_slug, v_user_id)
  returning * into v_workspace;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (v_workspace.id, v_user_id, 'owner');

  return v_workspace;
end;
$$;

comment on function public.create_workspace(text, text) is 'Creates a workspace owned by the calling user.';

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;

-- profiles --------------------------------------------------------------------

create policy "profiles: read self and workspace co-members"
  on public.profiles for select
  to authenticated
  using (
    id = (select auth.uid())
    or id in (
      select m.user_id
      from public.workspace_members m
      where m.workspace_id in (select private.user_workspace_ids())
    )
  );

create policy "profiles: update self"
  on public.profiles for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- workspaces ------------------------------------------------------------------

create policy "workspaces: members can read"
  on public.workspaces for select
  to authenticated
  using (id in (select private.user_workspace_ids()));

create policy "workspaces: admins can update"
  on public.workspaces for update
  to authenticated
  using (private.has_workspace_role(id, 'admin'))
  with check (private.has_workspace_role(id, 'admin'));

create policy "workspaces: owners can delete"
  on public.workspaces for delete
  to authenticated
  using (private.has_workspace_role(id, 'owner'));

-- workspace_members -----------------------------------------------------------
-- No INSERT policy: memberships are created by trusted functions only
-- (signup, create_workspace, and the future accept_invitation).

create policy "workspace_members: members can read co-members"
  on public.workspace_members for select
  to authenticated
  using (workspace_id in (select private.user_workspace_ids()));

-- Admins manage roles; only owners can grant, change or revoke ownership.
create policy "workspace_members: admins can change roles"
  on public.workspace_members for update
  to authenticated
  using (
    private.has_workspace_role(workspace_id, 'admin')
    and (role <> 'owner' or private.has_workspace_role(workspace_id, 'owner'))
  )
  with check (
    private.has_workspace_role(workspace_id, 'admin')
    and (role <> 'owner' or private.has_workspace_role(workspace_id, 'owner'))
  );

create policy "workspace_members: leave, or admins remove members"
  on public.workspace_members for delete
  to authenticated
  using (
    user_id = (select auth.uid())
    or (
      private.has_workspace_role(workspace_id, 'admin')
      and (role <> 'owner' or private.has_workspace_role(workspace_id, 'owner'))
    )
  );

-- -----------------------------------------------------------------------------
-- Privileges (least privilege; RLS narrows rows further)
-- -----------------------------------------------------------------------------

revoke all on table public.profiles, public.workspaces, public.workspace_members from anon, authenticated;

grant select on table public.profiles, public.workspaces, public.workspace_members to authenticated;
grant update (full_name, avatar_url) on table public.profiles to authenticated;
grant update (name, slug) on table public.workspaces to authenticated;
grant delete on table public.workspaces to authenticated;
grant update (role) on table public.workspace_members to authenticated;
grant delete on table public.workspace_members to authenticated;

grant all on table public.profiles, public.workspaces, public.workspace_members to service_role;

revoke all on function public.create_workspace(text, text) from public, anon;
grant execute on function public.create_workspace(text, text) to authenticated, service_role;

-- Policies run as the calling role, so it needs to reach the helpers.
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;
revoke all on all functions in schema private from public;
grant execute on function private.user_workspace_ids() to authenticated, service_role;
grant execute on function private.has_workspace_role(uuid, public.workspace_role) to authenticated, service_role;

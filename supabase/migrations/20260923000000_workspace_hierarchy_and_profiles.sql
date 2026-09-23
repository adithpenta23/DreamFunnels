-- =============================================================================
-- Agency -> client hierarchy, business profile and user preferences (Sprint 2)
--
-- Tenancy:
--   * A workspace is an `agency` (top level) or a `client` of exactly one
--     agency. Depth is fixed at one level; there is no organization table and
--     no second membership model.
--   * Invariants live in the schema, not in triggers: a CHECK ties the type to
--     the parent, and a composite foreign key on (parent id, 'agency') makes
--     "the parent is an agency" hold for every writer and under concurrency.
--     The same key blocks turning an agency with clients into a client, and
--     deleting an agency that still has clients (RESTRICT).
--   * Every existing workspace becomes an agency with no parent: that is what
--     they already are (standalone, top level). No row changes meaning.
--   * Hierarchy columns are never granted to `authenticated`: nobody can move a
--     workspace between agencies or change its type through the API. Future
--     agency/client provisioning goes through a trusted SQL function.
--
-- Access (see docs/DATABASE.md "Agency access"):
--   * private.user_workspace_ids() stays the one isolation primitive. It now
--     returns direct memberships plus the clients of agencies where the user
--     is an admin or owner. Agency members get nothing extra; client members
--     never see their agency or sibling clients.
--   * private.workspace_role() is the effective role: the direct role, or the
--     agency role (admin/owner) carried down to the agency's clients, whichever
--     is higher. has_workspace_role() uses it, so every existing policy
--     applies the same rule.
--
-- Profile data:
--   * workspaces: IANA time zone (required, default UTC) and the business
--     profile used by future messaging, booking and websites.
--   * profiles: phone, time zone and locale for notifications and scheduling.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Types
-- -----------------------------------------------------------------------------

create type public.workspace_type as enum ('agency', 'client');

-- -----------------------------------------------------------------------------
-- Validation helpers
-- -----------------------------------------------------------------------------

-- True for IANA "Area/Location" zone names Postgres knows (plus UTC). Postgres
-- itself would also accept POSIX strings and bare offsets such as '-5' or
-- 'UTC+5', which carry no daylight-saving rules; Etc/GMT+N zones are fixed
-- offsets too. Those are all rejected, so stored values always name a place.
-- Lookups are case-insensitive, so the pattern also insists on the canonical
-- capitalisation (every IANA path segment starts with a capital letter).
-- Mirrored in src/lib/timezones.ts.
create function private.is_valid_timezone(p_timezone text)
returns boolean
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_timezone is null
    or char_length(p_timezone) > 64
    or p_timezone !~ '^(UTC|[A-Z][A-Za-z]+(/[A-Z][A-Za-z0-9_+-]*)+)$'
    or p_timezone ~ '^(Etc|posix|right)/'
  then
    return false;
  end if;

  perform pg_catalog.timezone(p_timezone, pg_catalog.now());
  return true;
exception
  when invalid_parameter_value then
    return false;
end;
$$;

comment on function private.is_valid_timezone(text) is
  'True for IANA Area/Location time zone names (and UTC); rejects offsets and POSIX strings.';

-- -----------------------------------------------------------------------------
-- Workspaces: hierarchy
-- -----------------------------------------------------------------------------

alter table public.workspaces
  add column workspace_type public.workspace_type not null default 'agency',
  add column parent_workspace_id uuid,
  -- Always 'agency' when there is a parent. Only exists so the foreign key
  -- below can require the parent row's type to be 'agency'.
  add column parent_workspace_type public.workspace_type
    generated always as (
      case when parent_workspace_id is not null then 'agency'::public.workspace_type end
    ) stored;

comment on column public.workspaces.workspace_type is
  'agency: top-level workspace (every self-serve workspace). client: managed by the agency in parent_workspace_id.';
comment on column public.workspaces.parent_workspace_id is
  'The owning agency of a client workspace; null for agencies. Changed only by trusted functions.';

-- Target of the parent foreign key (id alone is already unique).
alter table public.workspaces
  add constraint workspaces_id_type_key unique (id, workspace_type);

alter table public.workspaces
  -- A client always has a parent; an agency never does.
  add constraint workspaces_hierarchy_check check (
    (workspace_type = 'agency' and parent_workspace_id is null)
    or (workspace_type = 'client' and parent_workspace_id is not null)
  ),
  add constraint workspaces_not_own_parent check (parent_workspace_id <> id),
  -- The parent must be an agency, so a client can't parent anything and the
  -- tree is exactly one level deep. RESTRICT: removing an agency that still
  -- has clients fails instead of cascading into its clients' data, and an
  -- agency with clients can't be retyped as a client.
  add constraint workspaces_parent_fkey
    foreign key (parent_workspace_id, parent_workspace_type)
    references public.workspaces (id, workspace_type)
    on update restrict
    on delete restrict;

-- "Which clients does this agency have?": used by user_workspace_ids() and by
-- the foreign key check when an agency is deleted or retyped.
create index workspaces_parent_workspace_id_idx
  on public.workspaces (parent_workspace_id)
  where parent_workspace_id is not null;

-- -----------------------------------------------------------------------------
-- Workspaces: time zone and business profile
-- -----------------------------------------------------------------------------
-- Null means "not provided". Shapes are mirrored in
-- src/features/workspaces/schemas.ts; the app sends null, never ''.

alter table public.workspaces
  add column timezone text not null default 'UTC'
    constraint workspaces_timezone_check check (private.is_valid_timezone(timezone)),
  add column business_name text
    constraint workspaces_business_name_check
    check (char_length(btrim(business_name)) between 1 and 120),
  add column business_email text
    constraint workspaces_business_email_check
    check (char_length(business_email) <= 254 and business_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  -- E.164: "+" then 7-15 digits, the format SMS and voice providers expect.
  add column business_phone text
    constraint workspaces_business_phone_check check (business_phone ~ '^\+[1-9][0-9]{6,14}$'),
  add column address_line1 text
    constraint workspaces_address_line1_check check (char_length(btrim(address_line1)) between 1 and 200),
  add column address_line2 text
    constraint workspaces_address_line2_check check (char_length(btrim(address_line2)) between 1 and 200),
  add column address_city text
    constraint workspaces_address_city_check check (char_length(btrim(address_city)) between 1 and 100),
  add column address_region text
    constraint workspaces_address_region_check check (char_length(btrim(address_region)) between 1 and 100),
  add column address_postal_code text
    constraint workspaces_address_postal_code_check
    check (char_length(btrim(address_postal_code)) between 1 and 20),
  -- ISO 3166-1 alpha-2, uppercase.
  add column address_country text
    constraint workspaces_address_country_check check (address_country ~ '^[A-Z]{2}$'),
  add column logo_url text
    constraint workspaces_logo_url_check
    check (char_length(logo_url) <= 2048 and logo_url ~ '^https://[^[:space:]]+$'),
  -- Lowercase #rrggbb.
  add column brand_primary_color text
    constraint workspaces_brand_primary_color_check check (brand_primary_color ~ '^#[0-9a-f]{6}$'),
  add column brand_secondary_color text
    constraint workspaces_brand_secondary_color_check check (brand_secondary_color ~ '^#[0-9a-f]{6}$');

comment on column public.workspaces.timezone is
  'IANA time zone of the business (e.g. America/Chicago). Drives reminders, booking hours and reports.';
comment on column public.workspaces.name is
  'Workspace label inside the app. business_name is the customer-facing name (falls back to name).';

-- -----------------------------------------------------------------------------
-- Profiles: contact and preferences
-- -----------------------------------------------------------------------------

alter table public.profiles
  add column phone text
    constraint profiles_phone_check check (phone ~ '^\+[1-9][0-9]{6,14}$'),
  add column timezone text not null default 'UTC'
    constraint profiles_timezone_check check (private.is_valid_timezone(timezone)),
  -- BCP 47 language[-Script][-REGION], e.g. en-US, pt-BR, zh-Hant-TW.
  add column locale text not null default 'en-US'
    constraint profiles_locale_check
    check (locale ~ '^[a-z]{2,3}(-[A-Z][a-z]{3})?(-([A-Z]{2}|[0-9]{3}))?$');

comment on column public.profiles.timezone is 'IANA time zone of the person, for their own notifications.';
comment on column public.profiles.locale is 'BCP 47 locale for formatting dates and numbers for this person.';

-- -----------------------------------------------------------------------------
-- Authorization helpers
-- -----------------------------------------------------------------------------

-- The workspaces the current user can access:
--   1. every workspace they are a direct member of, and
--   2. the clients of every agency where they are an admin or owner.
-- The join only follows parent -> client, and a client can't be a parent, so
-- this never reaches a parent, a sibling or anything outside the agency.
-- Mirrors private.workspace_role() below; change both together.
create or replace function private.user_workspace_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.workspace_id
  from public.workspace_members m
  where m.user_id = (select auth.uid())
  union
  select c.id
  from public.workspace_members m
  join public.workspaces c on c.parent_workspace_id = m.workspace_id
  where m.user_id = (select auth.uid())
    and m.role >= 'admin'
    and c.workspace_type = 'client';
$$;

-- The current user's effective role in a workspace, or null without access:
-- the higher of their direct role and, for a client, their agency role when
-- that is admin or owner (agency owners own their clients, agency admins
-- administer them). Mirrors private.user_workspace_ids() above.
create function private.workspace_role(p_workspace_id uuid)
returns public.workspace_role
language sql
stable
security definer
set search_path = ''
as $$
  select max(r.role)
  from (
    select m.role
    from public.workspace_members m
    where m.workspace_id = p_workspace_id
      and m.user_id = (select auth.uid())
    union all
    select am.role
    from public.workspaces c
    join public.workspace_members am on am.workspace_id = c.parent_workspace_id
    where c.id = p_workspace_id
      and c.workspace_type = 'client'
      and am.user_id = (select auth.uid())
      and am.role >= 'admin'
  ) r;
$$;

-- Unchanged signature; now honours agency access through workspace_role().
create or replace function private.has_workspace_role(
  p_workspace_id uuid,
  p_min_role public.workspace_role
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.workspace_role(p_workspace_id) >= p_min_role, false);
$$;

-- PostgREST computed field: `select=id,name,viewer_role` returns the caller's
-- effective role alongside each visible workspace (never null for a row the
-- caller can see). Invoker rights: it only ever describes the caller. The row
-- argument is unnamed on purpose: that's how the type generator recognises a
-- computed field and adds `viewer_role` to the workspaces Row type.
create function public.viewer_role(public.workspaces)
returns public.workspace_role
language sql
stable
set search_path = ''
as $$
  select private.workspace_role($1.id);
$$;

comment on function public.viewer_role(public.workspaces) is
  'The calling user''s effective role in the workspace (direct or inherited from its agency).';

-- -----------------------------------------------------------------------------
-- Workspace creation: optional time zone
-- -----------------------------------------------------------------------------
-- Same behaviour as before, plus p_timezone (default UTC). Every workspace
-- created here is an agency: clients are provisioned by a future agency
-- function. Named-argument calls from older app versions keep working.

drop function public.create_workspace(text, text);

create function public.create_workspace(
  p_name text,
  p_slug text default null,
  p_timezone text default null
)
returns public.workspaces
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_name text := btrim(p_name);
  v_slug text := nullif(btrim(p_slug), '');
  v_timezone text := coalesce(nullif(btrim(p_timezone), ''), 'UTC');
  v_base text;
  v_attempt integer := 0;
  v_workspace public.workspaces;
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  if v_slug is not null then
    insert into public.workspaces (name, slug, created_by, timezone)
    values (v_name, v_slug, v_user_id, v_timezone)
    returning * into v_workspace;
  else
    -- 40 characters leaves room for the "-xxxxxx" suffix within the 48 limit.
    v_base := trim(both '-' from left(private.slugify(v_name), 40));
    if v_base = '' then
      v_base := 'workspace';
    end if;

    loop
      v_attempt := v_attempt + 1;
      v_slug := case
        when v_attempt = 1
          and char_length(v_base) >= 3
          and not private.is_reserved_workspace_slug(v_base)
          then v_base
        else v_base || '-' || substr(md5(gen_random_uuid()::text), 1, 6)
      end;

      begin
        insert into public.workspaces (name, slug, created_by, timezone)
        values (v_name, v_slug, v_user_id, v_timezone)
        returning * into v_workspace;
        exit;
      exception when unique_violation then
        -- Taken: retry with a new suffix, but never loop forever.
        if v_attempt >= 5 then
          raise;
        end if;
      end;
    end loop;
  end if;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (v_workspace.id, v_user_id, 'owner');

  return v_workspace;
end;
$$;

comment on function public.create_workspace(text, text, text) is
  'Creates an agency workspace owned by the calling user. Generates the slug when p_slug is null; p_timezone defaults to UTC.';

-- -----------------------------------------------------------------------------
-- Privileges
-- -----------------------------------------------------------------------------

-- Editable business profile. Deliberately absent: workspace_type,
-- parent_workspace_id (hierarchy) and created_by.
grant update (
  timezone,
  business_name,
  business_email,
  business_phone,
  address_line1,
  address_line2,
  address_city,
  address_region,
  address_postal_code,
  address_country,
  logo_url,
  brand_primary_color,
  brand_secondary_color
) on table public.workspaces to authenticated;

grant update (phone, timezone, locale) on table public.profiles to authenticated;

revoke all on function public.create_workspace(text, text, text) from public, anon;
grant execute on function public.create_workspace(text, text, text) to authenticated, service_role;

revoke all on function public.viewer_role(public.workspaces) from public, anon;
grant execute on function public.viewer_role(public.workspaces) to authenticated, service_role;

-- Policies and viewer_role() run as the calling role, so it needs the helpers.
revoke all on function private.workspace_role(uuid) from public;
grant execute on function private.workspace_role(uuid) to authenticated, service_role;

-- CHECK constraints run their functions as the writing role.
revoke all on function private.is_valid_timezone(text) from public;
grant execute on function private.is_valid_timezone(text) to authenticated, service_role;

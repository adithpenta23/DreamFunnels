-- =============================================================================
-- Onboarding-driven workspace creation (Sprint 1)
--
-- Users now create their first workspace during onboarding instead of getting
-- an auto-named personal workspace at signup:
--   * private.handle_new_user() provisions the profile only.
--   * public.create_workspace(name, slug) accepts a null slug and generates a
--     unique one from the name ("Acme Inc." -> "acme-inc", or
--     "acme-inc-3f9a1c" when that is taken).
--   * Reserved slugs are rejected so app routes and future subdomains (www,
--     app, api, ...) can never be claimed by a tenant.
--
-- "Has no workspace membership" is what sends a user to onboarding, so no
-- onboarding flag is stored.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Slug helpers
-- -----------------------------------------------------------------------------

-- Mirrored in src/features/workspaces/lib/slug.ts (RESERVED_WORKSPACE_SLUGS).
create function private.is_reserved_workspace_slug(p_slug text)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select p_slug = any (array[
    'admin', 'api', 'app', 'auth', 'billing', 'blog', 'dashboard', 'docs', 'help',
    'login', 'logout', 'mail', 'new', 'onboarding', 'settings', 'signup', 'static',
    'status', 'support', 'workspace', 'workspaces', 'www'
  ]::text[]);
$$;

-- Free text to slug: 'Café Münster & Co.' -> 'cafe-munster-co'. Accents are
-- folded before lowercasing so the result doesn't depend on the database
-- locale. Returns '' when nothing usable remains.
-- Mirrored in src/features/workspaces/lib/slug.ts (slugify).
create function private.slugify(p_value text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select trim(both '-' from regexp_replace(
    lower(regexp_replace(normalize(coalesce(p_value, ''), nfkd), '[̀-ͯ]', '', 'g')),
    '[^a-z0-9]+', '-', 'g'
  ));
$$;

alter table public.workspaces
  add constraint workspaces_slug_not_reserved
  check (not private.is_reserved_workspace_slug(slug));

-- -----------------------------------------------------------------------------
-- Signup: profile only
-- -----------------------------------------------------------------------------

-- Runs inside the auth.users insert: if it fails, signup fails, so it only
-- copies display fields and never trusts metadata beyond the column limits.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_full_name text := nullif(btrim(new.raw_user_meta_data ->> 'full_name'), '');
  v_avatar_url text := nullif(btrim(new.raw_user_meta_data ->> 'avatar_url'), '');
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    left(v_full_name, 120),
    case when char_length(v_avatar_url) <= 2048 then v_avatar_url end
  );
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Workspace creation
-- -----------------------------------------------------------------------------

-- Creates a workspace and makes the caller its owner in one transaction; still
-- the only way for clients to create one (there is no INSERT grant).
--   * p_slug given: used as-is. Constraint errors reach the caller: 23514 for
--     an invalid or reserved slug, 23505 when it is taken.
--   * p_slug null or blank: generated from the name, adding a random suffix
--     when the plain slug is short, reserved or taken.
create or replace function public.create_workspace(p_name text, p_slug text default null)
returns public.workspaces
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_name text := btrim(p_name);
  v_slug text := nullif(btrim(p_slug), '');
  v_base text;
  v_attempt integer := 0;
  v_workspace public.workspaces;
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  if v_slug is not null then
    insert into public.workspaces (name, slug, created_by)
    values (v_name, v_slug, v_user_id)
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
        insert into public.workspaces (name, slug, created_by)
        values (v_name, v_slug, v_user_id)
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

comment on function public.create_workspace(text, text) is
  'Creates a workspace owned by the calling user. Generates the slug from the name when p_slug is null.';

-- -----------------------------------------------------------------------------
-- Privileges
-- -----------------------------------------------------------------------------

revoke all on function public.create_workspace(text, text) from public, anon;
grant execute on function public.create_workspace(text, text) to authenticated, service_role;

-- CHECK constraints run their functions as the writing role, so roles that
-- may write workspaces.slug need EXECUTE on the reserved-slug check.
revoke all on function private.is_reserved_workspace_slug(text) from public;
grant execute on function private.is_reserved_workspace_slug(text) to authenticated, service_role;

-- Only called from create_workspace(), which runs as its owner.
revoke all on function private.slugify(text) from public;

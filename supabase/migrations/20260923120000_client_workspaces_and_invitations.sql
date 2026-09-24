-- =============================================================================
-- Client workspaces, invitations and the membership audit log (Sprint 3)
--
-- Clients:
--   * public.create_client_workspace() is the only way to create a client. The
--     parent is checked against the caller's own authority (an agency they own
--     or administer), never trusted from the request. The client and its
--     business profile are written in one transaction. Agency owners and admins
--     reach it through inheritance (Sprint 2), so it starts with no direct
--     members and no data.
--   * Client names are unique per agency (case-insensitive): two clients with
--     one name are confusing, and it makes a double-submitted form harmless.
--   * workspaces.website_url joins the business profile.
--
-- Invitations:
--   * public.workspace_invitations stores the SHA-256 of a random 256-bit
--     token, never the token. The raw token only exists in the emailed link.
--   * One open (not accepted, not revoked) invitation per workspace and email,
--     enforced by a partial unique index. Re-inviting an expired address reuses
--     its row with a new token; resending rotates the token, so older links
--     stop working.
--   * Owners and admins read their workspaces' invitations (never the token
--     hash). Nobody writes the table directly: every write goes through a
--     SECURITY DEFINER function that checks the caller's role, so role
--     ceilings, "already a member" and token rotation can't be bypassed.
--   * Invitations grant `member` or `admin`, never `owner`.
--   * accept_workspace_invitation() locks the invitation, requires a verified
--     email equal to the invited one, then inserts the membership and marks the
--     invitation accepted atomically. Concurrent accepts serialize on the lock.
--   * get_workspace_invitation() is the public preview behind /invite/<token>:
--     it needs the token's hash and returns display fields only (no ids).
--
-- Audit:
--   * private.audit_log is append-only and not exposed through the Data API.
--     A trigger records every membership change; the invitation and client
--     functions record their own events. Never tokens or secrets.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Audit log
-- -----------------------------------------------------------------------------

create table private.audit_log (
  id bigint generated always as identity primary key,
  -- Deleting a workspace deletes its history with the rest of its data.
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  -- auth.uid() of whoever acted; null for trusted system code. No foreign key:
  -- the history outlives the account.
  actor_user_id uuid,
  event_type text not null check (event_type ~ '^[a-z]+(\.[a-z_]+)+$'),
  target_user_id uuid,
  target_email text check (char_length(target_email) <= 254),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

comment on table private.audit_log is
  'Append-only record of security-relevant workspace events (membership, invitations, clients). Written by triggers and definer functions only.';

create index audit_log_workspace_id_created_at_idx
  on private.audit_log (workspace_id, created_at desc);

alter table private.audit_log enable row level security;
revoke all on table private.audit_log from public, anon, authenticated;
-- Read-only for trusted tooling; still no UPDATE or DELETE for anyone.
grant select on table private.audit_log to service_role;

-- Records one event as the current caller. Only definer code calls it.
create function private.write_audit_event(
  p_workspace_id uuid,
  p_event_type text,
  p_target_user_id uuid default null,
  p_target_email text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into private.audit_log (workspace_id, actor_user_id, event_type, target_user_id, target_email, metadata)
  values (
    p_workspace_id,
    (select auth.uid()),
    p_event_type,
    p_target_user_id,
    p_target_email,
    coalesce(p_metadata, '{}'::jsonb)
  );
$$;

-- Every membership change, whichever path made it (definer functions, or
-- admins updating/deleting rows under RLS).
create function private.audit_membership_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform private.write_audit_event(
      new.workspace_id, 'workspace.member_added', new.user_id, null,
      jsonb_build_object('role', new.role)
    );
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.role is distinct from old.role then
      perform private.write_audit_event(
        new.workspace_id, 'workspace.member_role_changed', new.user_id, null,
        jsonb_build_object('from', old.role, 'to', new.role)
      );
    end if;
    return new;
  end if;

  -- DELETE. Cascades (the workspace or the user's profile is being deleted)
  -- aren't membership decisions, and the workspace may already be gone.
  if not exists (select 1 from public.workspaces w where w.id = old.workspace_id)
    or not exists (select 1 from public.profiles p where p.id = old.user_id) then
    return old;
  end if;
  perform private.write_audit_event(
    old.workspace_id,
    case when old.user_id = (select auth.uid()) then 'workspace.member_left' else 'workspace.member_removed' end,
    old.user_id, null,
    jsonb_build_object('role', old.role)
  );
  return old;
end;
$$;

create trigger workspace_members_audit
  after insert or update of role or delete on public.workspace_members
  for each row execute function private.audit_membership_change();

-- -----------------------------------------------------------------------------
-- Workspaces: website and client names
-- -----------------------------------------------------------------------------

alter table public.workspaces
  add column website_url text
    constraint workspaces_website_url_check
    check (char_length(website_url) <= 2048 and website_url ~ '^https?://[^[:space:]]+$');

comment on column public.workspaces.website_url is 'The business''s existing website, if any (http or https).';

-- One client per name within an agency, ignoring case and surrounding spaces.
create unique index workspaces_client_name_key
  on public.workspaces (parent_workspace_id, lower(btrim(name)))
  where parent_workspace_id is not null;

grant update (website_url) on table public.workspaces to authenticated;

-- -----------------------------------------------------------------------------
-- Client workspace creation
-- -----------------------------------------------------------------------------

-- The slug to try on attempt `p_attempt` for a workspace called `p_name`: the
-- plain slug first when it's usable, then the same base with a random suffix.
-- Same rules as create_workspace(); mirrored in
-- src/features/workspaces/lib/slug.ts (suggestWorkspaceSlug).
create function private.workspace_slug_candidate(p_name text, p_attempt integer)
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  -- 40 characters leaves room for the "-xxxxxx" suffix within the 48 limit.
  v_base text := trim(both '-' from left(private.slugify(p_name), 40));
begin
  if v_base = '' then
    v_base := 'workspace';
  end if;
  if p_attempt = 1 and char_length(v_base) >= 3 and not private.is_reserved_workspace_slug(v_base) then
    return v_base;
  end if;
  return v_base || '-' || substr(md5(gen_random_uuid()::text), 1, 6);
end;
$$;

-- Creates a client workspace under an agency the caller owns or administers,
-- with its business profile, in one transaction. Blank optional values become
-- null; the table's CHECK constraints validate the rest (23514).
--   * p_slug given: used as is (23505 when taken). Null: generated from the
--     name, retrying with a suffix on collisions.
--   * A client name already used in this agency fails with 23505 on
--     workspaces_client_name_key.
--   * 42501 when the caller can't add clients to p_agency_id, whether it
--     doesn't exist, isn't an agency, or belongs to someone else.
create function public.create_client_workspace(
  p_agency_id uuid,
  p_name text,
  p_slug text default null,
  p_timezone text default null,
  p_business_name text default null,
  p_business_email text default null,
  p_business_phone text default null,
  p_website_url text default null,
  p_address_line1 text default null,
  p_address_line2 text default null,
  p_address_city text default null,
  p_address_region text default null,
  p_address_postal_code text default null,
  p_address_country text default null
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
  v_attempt integer := 0;
  v_constraint text;
  v_workspace public.workspaces;
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  if not exists (
      select 1 from public.workspaces a
      where a.id = p_agency_id and a.workspace_type = 'agency'
    )
    or not private.has_workspace_role(p_agency_id, 'admin') then
    raise exception 'Not allowed to add clients to this workspace' using errcode = '42501';
  end if;

  loop
    v_attempt := v_attempt + 1;
    begin
      insert into public.workspaces (
        name, slug, workspace_type, parent_workspace_id, created_by, timezone,
        business_name, business_email, business_phone, website_url,
        address_line1, address_line2, address_city, address_region,
        address_postal_code, address_country
      )
      values (
        v_name,
        coalesce(v_slug, private.workspace_slug_candidate(v_name, v_attempt)),
        'client',
        p_agency_id,
        v_user_id,
        coalesce(nullif(btrim(p_timezone), ''), 'UTC'),
        nullif(btrim(p_business_name), ''),
        nullif(btrim(p_business_email), ''),
        nullif(btrim(p_business_phone), ''),
        nullif(btrim(p_website_url), ''),
        nullif(btrim(p_address_line1), ''),
        nullif(btrim(p_address_line2), ''),
        nullif(btrim(p_address_city), ''),
        nullif(btrim(p_address_region), ''),
        nullif(btrim(p_address_postal_code), ''),
        nullif(btrim(p_address_country), '')
      )
      returning * into v_workspace;
      exit;
    exception when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      -- Only a generated slug is retried: a chosen slug or a duplicate client
      -- name is for the caller to fix. Never loop forever.
      if v_slug is not null or v_constraint <> 'workspaces_slug_key' or v_attempt >= 5 then
        raise;
      end if;
    end;
  end loop;

  perform private.write_audit_event(
    p_agency_id, 'workspace.client_created', null, null,
    jsonb_build_object('client_workspace_id', v_workspace.id)
  );

  return v_workspace;
end;
$$;

comment on function public.create_client_workspace(uuid, text, text, text, text, text, text, text, text, text, text, text, text, text) is
  'Creates a client workspace (with its business profile) under an agency the caller owns or administers.';

-- -----------------------------------------------------------------------------
-- Invitations
-- -----------------------------------------------------------------------------

create table public.workspace_invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  -- Normalised (trimmed, lowercase), like Supabase Auth stores emails.
  email text not null
    constraint workspace_invitations_email_check
    check (
      char_length(email) <= 254
      and email = lower(btrim(email))
      and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    ),
  -- Ownership is never granted by invitation.
  role public.workspace_role not null
    constraint workspace_invitations_role_check check (role <> 'owner'),
  -- Hex SHA-256 of the token in the link. The token itself is never stored.
  token_hash text not null
    constraint workspace_invitations_token_hash_check check (token_hash ~ '^[0-9a-f]{64}$')
    constraint workspace_invitations_token_hash_key unique,
  -- Optional personal note from the inviter, shown in the email.
  message text
    constraint workspace_invitations_message_check check (char_length(btrim(message)) between 1 and 500),
  invited_by uuid references public.profiles (id) on delete set null,
  expires_at timestamptz not null,
  -- Whether the email for the current token was accepted by the provider.
  delivery_status text not null default 'pending'
    constraint workspace_invitations_delivery_status_check
    check (delivery_status in ('pending', 'sent', 'failed')),
  last_sent_at timestamptz,
  last_message_id text check (char_length(last_message_id) <= 200),
  accepted_at timestamptz,
  accepted_by uuid references public.profiles (id) on delete set null,
  revoked_at timestamptz,
  revoked_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspace_invitations_single_outcome check (accepted_at is null or revoked_at is null)
);

comment on table public.workspace_invitations is
  'Pending and past invitations to join a workspace. Written only through the invitation functions.';

-- At most one open invitation per address and workspace. Expired ones stay
-- open (and are reused when the address is invited again) so rows don't pile up.
create unique index workspace_invitations_open_email_key
  on public.workspace_invitations (workspace_id, email)
  where accepted_at is null and revoked_at is null;

create index workspace_invitations_workspace_id_idx
  on public.workspace_invitations (workspace_id, created_at desc);

create trigger workspace_invitations_set_updated_at
  before update on public.workspace_invitations
  for each row execute function private.set_updated_at();

alter table public.workspace_invitations enable row level security;

create policy "workspace_invitations: admins can read"
  on public.workspace_invitations for select
  to authenticated
  using (private.has_workspace_role(workspace_id, 'admin'));

-- No INSERT, UPDATE or DELETE policy or grant: writes go through the
-- functions below. The token hash isn't readable by anyone but its owner.
revoke all on table public.workspace_invitations from public, anon, authenticated;
grant select (
  id,
  workspace_id,
  email,
  role,
  message,
  invited_by,
  expires_at,
  delivery_status,
  last_sent_at,
  accepted_at,
  revoked_at,
  created_at,
  updated_at
) on table public.workspace_invitations to authenticated;
grant all on table public.workspace_invitations to service_role;

-- Creates an invitation (the caller must be an owner or admin), or explains
-- why not. The app generates the token and passes only its hash.
--   outcome 'created':          new, or an expired one for the same address
--                               reissued with this token (same row)
--   outcome 'already_pending':  an unexpired invitation is open (its id)
--   outcome 'already_member':   the address belongs to a direct member
-- 42501 without the right to invite (or to grant p_role); 22023 for 'owner'.
create function public.create_workspace_invitation(
  p_workspace_id uuid,
  p_email text,
  p_role public.workspace_role,
  p_token_hash text,
  p_message text default null
)
returns table (outcome text, invitation_id uuid, invitation_expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_email text := lower(btrim(p_email));
  v_message text := nullif(btrim(p_message), '');
  v_invitation public.workspace_invitations;
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  if not private.has_workspace_role(p_workspace_id, 'admin') then
    raise exception 'Not allowed to invite people to this workspace' using errcode = '42501';
  end if;
  if p_role is null or p_role = 'owner' then
    raise exception 'Invitations grant the member or admin role' using errcode = '22023';
  end if;
  -- Nobody grants more than they hold (today every inviter is admin or above).
  if not private.has_workspace_role(p_workspace_id, p_role) then
    raise exception 'Not allowed to grant that role' using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.workspace_members m
    join public.profiles p on p.id = m.user_id
    where m.workspace_id = p_workspace_id
      and lower(p.email) = v_email
  ) then
    return query select 'already_member'::text, null::uuid, null::timestamptz;
    return;
  end if;

  select i.* into v_invitation
  from public.workspace_invitations i
  where i.workspace_id = p_workspace_id
    and i.email = v_email
    and i.accepted_at is null
    and i.revoked_at is null
  for update;

  if found then
    if v_invitation.expires_at > now() then
      return query select 'already_pending'::text, v_invitation.id, v_invitation.expires_at;
      return;
    end if;

    -- Expired: reissue the same row with the new token, role and note.
    update public.workspace_invitations i
    set token_hash = p_token_hash,
        role = p_role,
        message = v_message,
        invited_by = v_user_id,
        expires_at = now() + interval '7 days',
        delivery_status = 'pending',
        last_message_id = null
    where i.id = v_invitation.id
    returning i.* into v_invitation;
  else
    begin
      insert into public.workspace_invitations (workspace_id, email, role, token_hash, message, invited_by, expires_at)
      values (p_workspace_id, v_email, p_role, p_token_hash, v_message, v_user_id, now() + interval '7 days')
      returning * into v_invitation;
    exception when unique_violation then
      -- A concurrent request invited the same address first.
      select i.* into v_invitation
      from public.workspace_invitations i
      where i.workspace_id = p_workspace_id
        and i.email = v_email
        and i.accepted_at is null
        and i.revoked_at is null;
      if not found then
        raise;
      end if;
      return query select 'already_pending'::text, v_invitation.id, v_invitation.expires_at;
      return;
    end;
  end if;

  perform private.write_audit_event(
    p_workspace_id, 'workspace.member_invited', null, v_email,
    jsonb_build_object('invitation_id', v_invitation.id, 'role', v_invitation.role)
  );

  return query select 'created'::text, v_invitation.id, v_invitation.expires_at;
end;
$$;

-- Sends an open invitation again with a new token (the old link stops
-- working) and a fresh 7 days. Owners and admins of p_workspace_id only.
--   outcome 'resent' | 'not_found' | 'accepted' | 'revoked'
create function public.resend_workspace_invitation(
  p_workspace_id uuid,
  p_invitation_id uuid,
  p_token_hash text
)
returns table (
  outcome text,
  invitation_email text,
  invitation_role public.workspace_role,
  invitation_message text,
  invitation_expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_invitation public.workspace_invitations;
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  if not private.has_workspace_role(p_workspace_id, 'admin') then
    raise exception 'Not allowed to manage invitations for this workspace' using errcode = '42501';
  end if;

  select i.* into v_invitation
  from public.workspace_invitations i
  where i.id = p_invitation_id and i.workspace_id = p_workspace_id
  for update;

  if not found then
    return query select 'not_found'::text, null::text, null::public.workspace_role, null::text, null::timestamptz;
    return;
  end if;
  if v_invitation.accepted_at is not null or v_invitation.revoked_at is not null then
    return query select
      case when v_invitation.accepted_at is not null then 'accepted' else 'revoked' end,
      null::text, null::public.workspace_role, null::text, null::timestamptz;
    return;
  end if;

  update public.workspace_invitations i
  set token_hash = p_token_hash,
      invited_by = v_user_id,
      expires_at = now() + interval '7 days',
      delivery_status = 'pending',
      last_message_id = null
  where i.id = v_invitation.id
  returning i.* into v_invitation;

  perform private.write_audit_event(
    p_workspace_id, 'workspace.invitation_resent', null, v_invitation.email,
    jsonb_build_object('invitation_id', v_invitation.id)
  );

  return query select
    'resent'::text, v_invitation.email, v_invitation.role, v_invitation.message, v_invitation.expires_at;
end;
$$;

-- Revokes an open invitation (owners and admins). Idempotent; the row stays
-- for the record. Returns 'revoked' | 'not_found' | 'accepted'.
create function public.revoke_workspace_invitation(p_workspace_id uuid, p_invitation_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_invitation public.workspace_invitations;
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  if not private.has_workspace_role(p_workspace_id, 'admin') then
    raise exception 'Not allowed to manage invitations for this workspace' using errcode = '42501';
  end if;

  select i.* into v_invitation
  from public.workspace_invitations i
  where i.id = p_invitation_id and i.workspace_id = p_workspace_id
  for update;

  if not found then
    return 'not_found';
  end if;
  if v_invitation.accepted_at is not null then
    return 'accepted';
  end if;
  if v_invitation.revoked_at is not null then
    return 'revoked';
  end if;

  update public.workspace_invitations i
  set revoked_at = now(), revoked_by = v_user_id
  where i.id = v_invitation.id;

  perform private.write_audit_event(
    p_workspace_id, 'workspace.invitation_revoked', null, v_invitation.email,
    jsonb_build_object('invitation_id', v_invitation.id)
  );
  return 'revoked';
end;
$$;

-- Records whether the email for the invitation's current token went out.
-- A result for a superseded token (resent meanwhile) changes nothing.
create function public.record_workspace_invitation_delivery(
  p_invitation_id uuid,
  p_token_hash text,
  p_delivered boolean,
  p_message_id text default null
)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.workspace_invitations i
  set delivery_status = case when p_delivered then 'sent' else 'failed' end,
      last_sent_at = case when p_delivered then now() else i.last_sent_at end,
      last_message_id = case when p_delivered then left(p_message_id, 200) else i.last_message_id end
  where i.id = p_invitation_id
    and i.token_hash = p_token_hash
    and i.accepted_at is null
    and i.revoked_at is null
    and private.has_workspace_role(i.workspace_id, 'admin');
$$;

-- What /invite/<token> shows. Anyone holding the token may see it (the token
-- was emailed to the invitee), so it returns display fields only: no ids.
-- No row means "no such invitation". `workspace_slug` is only returned to the
-- person who accepted it, so they can be sent straight in.
create function public.get_workspace_invitation(p_token_hash text)
returns table (
  status text,
  email text,
  role public.workspace_role,
  workspace_name text,
  inviter_name text,
  expires_at timestamptz,
  workspace_slug text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    case
      when i.revoked_at is not null then 'revoked'
      when i.accepted_at is not null then 'accepted'
      when i.expires_at <= now() then 'expired'
      else 'pending'
    end,
    i.email,
    i.role,
    w.name,
    coalesce(nullif(btrim(p.full_name), ''), p.email),
    i.expires_at,
    case when i.accepted_at is not null and i.accepted_by = (select auth.uid()) then w.slug end
  from public.workspace_invitations i
  join public.workspaces w on w.id = i.workspace_id
  left join public.profiles p on p.id = i.invited_by
  where p_token_hash ~ '^[0-9a-f]{64}$'
    and i.token_hash = p_token_hash;
$$;

-- Accepts an invitation for the signed-in user. The invitation must be open
-- and unexpired, and the caller's verified email must be the invited one.
-- Membership and acceptance are written together; the row lock makes
-- concurrent accepts of one invitation run one after the other.
--   outcome 'accepted'         joined (or this user already accepted it)
--   outcome 'already_member'   was a direct member already; kept their role
--   outcome 'invalid' | 'revoked' | 'expired' | 'already_used'
--   outcome 'email_mismatch' | 'email_unverified'
create function public.accept_workspace_invitation(p_token_hash text)
returns table (outcome text, workspace_slug text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_invitation public.workspace_invitations;
  v_slug text;
  v_user_email text;
  v_confirmed_at timestamptz;
  v_inserted integer;
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return query select 'invalid'::text, null::text;
    return;
  end if;

  select i.* into v_invitation
  from public.workspace_invitations i
  where i.token_hash = p_token_hash
  for update;

  if not found then
    return query select 'invalid'::text, null::text;
    return;
  end if;

  select w.slug into v_slug from public.workspaces w where w.id = v_invitation.workspace_id;

  if v_invitation.revoked_at is not null then
    return query select 'revoked'::text, null::text;
    return;
  end if;
  if v_invitation.accepted_at is not null then
    if v_invitation.accepted_by = v_user_id then
      return query select 'accepted'::text, v_slug;
    else
      return query select 'already_used'::text, null::text;
    end if;
    return;
  end if;
  if v_invitation.expires_at <= now() then
    return query select 'expired'::text, null::text;
    return;
  end if;

  select u.email, u.email_confirmed_at into v_user_email, v_confirmed_at
  from auth.users u
  where u.id = v_user_id;

  if v_confirmed_at is null then
    return query select 'email_unverified'::text, null::text;
    return;
  end if;
  if lower(btrim(v_user_email)) is distinct from v_invitation.email then
    return query select 'email_mismatch'::text, null::text;
    return;
  end if;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (v_invitation.workspace_id, v_user_id, v_invitation.role)
  on conflict (workspace_id, user_id) do nothing;
  get diagnostics v_inserted = row_count;

  update public.workspace_invitations i
  set accepted_at = now(), accepted_by = v_user_id
  where i.id = v_invitation.id;

  perform private.write_audit_event(
    v_invitation.workspace_id, 'workspace.invitation_accepted', v_user_id, v_invitation.email,
    jsonb_build_object('invitation_id', v_invitation.id, 'role', v_invitation.role, 'already_member', v_inserted = 0)
  );

  return query select
    case when v_inserted = 0 then 'already_member' else 'accepted' end,
    v_slug;
end;
$$;

-- -----------------------------------------------------------------------------
-- Computed fields for the client list (one query, no N+1)
-- -----------------------------------------------------------------------------
-- Invoker rights: counts only what the caller may see. Unnamed row argument so
-- the type generator adds them to the workspaces Row type (like viewer_role).

create function public.member_count(public.workspaces)
returns integer
language sql
stable
set search_path = ''
as $$
  select count(*)::integer from public.workspace_members m where m.workspace_id = $1.id;
$$;

create function public.pending_invitation_count(public.workspaces)
returns integer
language sql
stable
set search_path = ''
as $$
  select count(*)::integer
  from public.workspace_invitations i
  where i.workspace_id = $1.id
    and i.accepted_at is null
    and i.revoked_at is null
    and i.expires_at > now();
$$;

-- -----------------------------------------------------------------------------
-- Privileges
-- -----------------------------------------------------------------------------

revoke all on function public.create_client_workspace(uuid, text, text, text, text, text, text, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.create_client_workspace(uuid, text, text, text, text, text, text, text, text, text, text, text, text, text) to authenticated, service_role;

revoke all on function public.create_workspace_invitation(uuid, text, public.workspace_role, text, text) from public, anon;
grant execute on function public.create_workspace_invitation(uuid, text, public.workspace_role, text, text) to authenticated, service_role;

revoke all on function public.resend_workspace_invitation(uuid, uuid, text) from public, anon;
grant execute on function public.resend_workspace_invitation(uuid, uuid, text) to authenticated, service_role;

revoke all on function public.revoke_workspace_invitation(uuid, uuid) from public, anon;
grant execute on function public.revoke_workspace_invitation(uuid, uuid) to authenticated, service_role;

revoke all on function public.record_workspace_invitation_delivery(uuid, text, boolean, text) from public, anon;
grant execute on function public.record_workspace_invitation_delivery(uuid, text, boolean, text) to authenticated, service_role;

revoke all on function public.accept_workspace_invitation(text) from public, anon;
grant execute on function public.accept_workspace_invitation(text) to authenticated, service_role;

-- The public invitation page runs before sign-in.
revoke all on function public.get_workspace_invitation(text) from public;
grant execute on function public.get_workspace_invitation(text) to anon, authenticated, service_role;

revoke all on function public.member_count(public.workspaces) from public, anon;
grant execute on function public.member_count(public.workspaces) to authenticated, service_role;

revoke all on function public.pending_invitation_count(public.workspaces) from public, anon;
grant execute on function public.pending_invitation_count(public.workspaces) to authenticated, service_role;

-- Internal helpers: only definer code (running as the owner) calls them.
revoke all on function private.write_audit_event(uuid, text, uuid, text, jsonb) from public;
revoke all on function private.audit_membership_change() from public;
revoke all on function private.workspace_slug_candidate(text, integer) from public;

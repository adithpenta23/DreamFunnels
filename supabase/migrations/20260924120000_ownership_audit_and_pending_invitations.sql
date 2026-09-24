-- =============================================================================
-- Ownership, leaving, the audit log read path and pending invitations (Sprint 4)
--
-- Ownership:
--   * public.transfer_workspace_ownership(): a DIRECT owner hands ownership to
--     a direct member of the same workspace; the caller becomes an admin. One
--     transaction, rows locked, in agencies and clients alike.
--   * public.make_workspace_owner(): in a CLIENT workspace, an owner (direct,
--     or inherited as an owner of its agency) makes a direct member an owner
--     without stepping down. Agency owners have no direct row to transfer
--     from; this is how a client's own representative becomes its owner.
--   * Ownership is granted only by these two functions. Direct updates to
--     role = 'owner' are refused (the update policy's WITH CHECK), so every
--     grant is checked and audited; demoting owners stays a plain update for
--     owners, as before. Invitations still never grant ownership.
--
-- Client continuity (private.protect_last_owner):
--   * An agency's owners own its clients too. So a client may lose its last
--     DIRECT owner (they leave, or an agency owner demotes or removes them)
--     as long as its agency has an owner. Agency admins still never act on
--     owners (RLS), and agencies must always keep a direct owner.
--
-- Leaving: a member deletes their own membership row (the existing RLS
-- policy); the audit trigger records workspace.member_left and the trigger
-- above decides whether an owner may go.
--
-- Audit log: public.list_workspace_audit_events() is the only read path: a
-- workspace's owners and admins (agency owners and admins for their clients),
-- newest first with keyset paging, display names instead of ids, and never
-- tokens or hashes. The table itself stays unreadable and append-only.
-- Retention (1 year) is an operational policy (docs/DATABASE.md); nothing
-- deletes rows yet.
--
-- Pending invitations: public.list_my_pending_invitations() shows a signed-in
-- user the open invitations for their VERIFIED email, and
-- public.accept_workspace_invitation_by_id() accepts one of them. Both
-- acceptance paths (token, id) share private.accept_invitation(): one set of
-- checks, one lock, one membership insert, one audit event.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Last-owner protection with the client continuity rule
-- -----------------------------------------------------------------------------

create or replace function private.protect_last_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type public.workspace_type;
  v_parent uuid;
begin
  if tg_op = 'UPDATE' then
    if old.role <> 'owner' or new.role = 'owner' then
      return new;
    end if;
  else
    if old.role <> 'owner' then
      return old;
    end if;
    -- Cascades (the workspace or the user's profile is being deleted).
    if not exists (select 1 from public.workspaces w where w.id = old.workspace_id)
      or not exists (select 1 from public.profiles p where p.id = old.user_id) then
      return old;
    end if;
  end if;

  -- Serialize ownership changes per workspace so two owners can't demote
  -- each other concurrently and leave the workspace ownerless.
  select w.workspace_type, w.parent_workspace_id into v_type, v_parent
  from public.workspaces w
  where w.id = old.workspace_id
  for update;

  if exists (
    select 1
    from public.workspace_members m
    where m.workspace_id = old.workspace_id
      and m.role = 'owner'
      and m.user_id <> old.user_id
  ) then
    return case when tg_op = 'UPDATE' then new else old end;
  end if;

  -- Client continuity: the agency's owners own its clients, so a client
  -- without a direct owner is still owned. Agencies have no such fallback.
  if v_type = 'client' and exists (
    select 1
    from public.workspace_members am
    where am.workspace_id = v_parent
      and am.role = 'owner'
  ) then
    return case when tg_op = 'UPDATE' then new else old end;
  end if;

  raise exception 'A workspace must have at least one owner'
    using errcode = 'P0001', hint = 'Transfer ownership before leaving or demoting the last owner.';
end;
$$;

-- -----------------------------------------------------------------------------
-- Ownership is granted only through the functions below
-- -----------------------------------------------------------------------------

-- Same as before, except that nobody can set role = 'owner' by a direct
-- update any more (owners could, since Sprint 0). Demoting an owner is still
-- a direct update, for owners only.
alter policy "workspace_members: admins can change roles"
  on public.workspace_members
  using (
    private.has_workspace_role(workspace_id, 'admin')
    and (role <> 'owner' or private.has_workspace_role(workspace_id, 'owner'))
  )
  with check (
    private.has_workspace_role(workspace_id, 'admin')
    and role <> 'owner'
  );

-- The ownership functions record one ownership event instead of the two role
-- changes their updates would otherwise log. The flag is transaction-local
-- and set only by those definer functions; clients can't set settings through
-- the Data API.
create or replace function private.audit_membership_change()
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
    if new.role is distinct from old.role
      and coalesce(current_setting('dreamfunnels.ownership_change', true), '') <> 'on' then
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

-- Hands ownership from the caller (a direct owner) to another direct member
-- of the same workspace: the target becomes an owner, the caller an admin.
-- Locks both membership rows (in user id order, so concurrent calls can't
-- deadlock each other) and then the workspace, the same order the last-owner
-- trigger uses, and checks everything again under the locks.
--   'transferred'    done
--   'not_member'     the target isn't a direct member (never an invitation,
--                    an inherited agency role or anyone else)
--   'already_owner'  the target is an owner already
--   'self'           the caller named themselves
-- 42501 unless the caller is a direct owner of the workspace.
create function public.transfer_workspace_ownership(p_workspace_id uuid, p_new_owner_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_caller_role public.workspace_role;
  v_target_role public.workspace_role;
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  -- Checked before taking any lock (outsiders lock nothing), and again below.
  if not exists (
    select 1
    from public.workspace_members m
    where m.workspace_id = p_workspace_id and m.user_id = v_user_id and m.role = 'owner'
  ) then
    raise exception 'Only a direct owner of this workspace can transfer its ownership'
      using errcode = '42501';
  end if;
  if p_new_owner_id = v_user_id then
    return 'self';
  end if;

  perform 1
  from public.workspace_members m
  where m.workspace_id = p_workspace_id
    and m.user_id in (v_user_id, p_new_owner_id)
  order by m.user_id
  for update;

  select m.role into v_caller_role
  from public.workspace_members m
  where m.workspace_id = p_workspace_id and m.user_id = v_user_id;

  if v_caller_role is distinct from 'owner' then
    raise exception 'Only a direct owner of this workspace can transfer its ownership'
      using errcode = '42501';
  end if;

  perform 1 from public.workspaces w where w.id = p_workspace_id for update;

  select m.role into v_target_role
  from public.workspace_members m
  where m.workspace_id = p_workspace_id and m.user_id = p_new_owner_id;

  if v_target_role is null then
    return 'not_member';
  end if;
  if v_target_role = 'owner' then
    return 'already_owner';
  end if;

  perform set_config('dreamfunnels.ownership_change', 'on', true);
  -- Promote first, so the last-owner trigger sees the new owner when the
  -- caller steps down.
  update public.workspace_members m
  set role = 'owner'
  where m.workspace_id = p_workspace_id and m.user_id = p_new_owner_id;
  update public.workspace_members m
  set role = 'admin'
  where m.workspace_id = p_workspace_id and m.user_id = v_user_id;
  perform set_config('dreamfunnels.ownership_change', '', true);

  perform private.write_audit_event(
    p_workspace_id, 'workspace.ownership_transferred', p_new_owner_id, null,
    jsonb_build_object('from', v_target_role, 'to', 'owner', 'previous_owner_role', 'admin')
  );
  return 'transferred';
end;
$$;

comment on function public.transfer_workspace_ownership(uuid, uuid) is
  'A direct owner hands ownership to a direct member: they become owner, the caller becomes admin. Atomic.';

-- Makes a direct member of a CLIENT workspace an owner, without the caller
-- stepping down. The caller must be an owner of the client: directly, or as
-- an owner of its agency. Locks the target row, then the workspace.
--   'granted' | 'not_member' | 'already_owner' | 'self'
-- 42501 for a caller who isn't an owner, and for agency workspaces (their
-- owners transfer ownership instead).
create function public.make_workspace_owner(p_workspace_id uuid, p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_type public.workspace_type;
  v_target_role public.workspace_role;
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  -- One answer for "no such workspace", "not an owner" and "not a client".
  -- Checked before taking any lock, and again under the locks.
  if not exists (
      select 1 from public.workspaces w
      where w.id = p_workspace_id and w.workspace_type = 'client'
    )
    or not private.has_workspace_role(p_workspace_id, 'owner') then
    raise exception 'Only owners of a client workspace can make someone an owner'
      using errcode = '42501';
  end if;
  if p_user_id = v_user_id then
    return 'self';
  end if;

  select m.role into v_target_role
  from public.workspace_members m
  where m.workspace_id = p_workspace_id and m.user_id = p_user_id
  for update;

  select w.workspace_type into v_type
  from public.workspaces w
  where w.id = p_workspace_id
  for update;

  if v_type is distinct from 'client' or not private.has_workspace_role(p_workspace_id, 'owner') then
    raise exception 'Only owners of a client workspace can make someone an owner'
      using errcode = '42501';
  end if;

  if v_target_role is null then
    return 'not_member';
  end if;
  if v_target_role = 'owner' then
    return 'already_owner';
  end if;

  perform set_config('dreamfunnels.ownership_change', 'on', true);
  update public.workspace_members m
  set role = 'owner'
  where m.workspace_id = p_workspace_id and m.user_id = p_user_id;
  perform set_config('dreamfunnels.ownership_change', '', true);

  perform private.write_audit_event(
    p_workspace_id, 'workspace.owner_granted', p_user_id, null,
    jsonb_build_object('from', v_target_role, 'to', 'owner')
  );
  return 'granted';
end;
$$;

comment on function public.make_workspace_owner(uuid, uuid) is
  'In a client workspace, an owner (direct or via its agency) makes a direct member an owner too.';

-- -----------------------------------------------------------------------------
-- Audit log read path
-- -----------------------------------------------------------------------------

-- One workspace's audit events, newest first, for its owners and admins
-- (including agency owners and admins reading their clients' logs). Keyset
-- paging: pass the last id of a page as p_before_id for the next one. Dates
-- are calendar days in the workspace's time zone (inclusive). Returns display
-- names and a small allowlisted `details` object: no ids, tokens or hashes.
-- Actors who aren't visible to the reader elsewhere (e.g. agency staff seen
-- from a client) are shown by name on purpose: it's their action in this
-- workspace.
create function public.list_workspace_audit_events(
  p_workspace_id uuid,
  p_limit integer default 50,
  p_before_id bigint default null,
  p_event_type text default null,
  p_actor_id uuid default null,
  p_from date default null,
  p_to date default null
)
returns table (
  id bigint,
  created_at timestamptz,
  event_type text,
  actor_name text,
  target_name text,
  target_email text,
  details jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_timezone text;
begin
  if (select auth.uid()) is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  if not private.has_workspace_role(p_workspace_id, 'admin') then
    raise exception 'Only owners and admins can read the audit log' using errcode = '42501';
  end if;

  select w.timezone into v_timezone from public.workspaces w where w.id = p_workspace_id;

  return query
  select
    a.id,
    a.created_at,
    a.event_type,
    coalesce(nullif(btrim(actor.full_name), ''), actor.email),
    case when a.target_user_id is not null
      then coalesce(nullif(btrim(target.full_name), ''), target.email)
    end,
    a.target_email,
    jsonb_strip_nulls(jsonb_build_object(
      'role', a.metadata ->> 'role',
      'from', a.metadata ->> 'from',
      'to', a.metadata ->> 'to',
      'previous_owner_role', a.metadata ->> 'previous_owner_role',
      'already_member', a.metadata -> 'already_member',
      'method', a.metadata ->> 'method',
      'client_name', (
        select c.name
        from public.workspaces c
        where a.event_type = 'workspace.client_created'
          and c.parent_workspace_id = p_workspace_id
          and c.id::text = a.metadata ->> 'client_workspace_id'
      )
    ))
  from private.audit_log a
  left join public.profiles actor on actor.id = a.actor_user_id
  left join public.profiles target on target.id = a.target_user_id
  where a.workspace_id = p_workspace_id
    and (p_event_type is null or a.event_type = p_event_type)
    and (p_actor_id is null or a.actor_user_id = p_actor_id)
    and (p_from is null or a.created_at >= (p_from::timestamp at time zone v_timezone))
    and (p_to is null or a.created_at < ((p_to + 1)::timestamp at time zone v_timezone))
    and (
      p_before_id is null
      or (a.created_at, a.id) < (
        select c.created_at, c.id
        from private.audit_log c
        where c.id = p_before_id and c.workspace_id = p_workspace_id
      )
    )
  order by a.created_at desc, a.id desc
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
end;
$$;

comment on function public.list_workspace_audit_events(uuid, integer, bigint, text, uuid, date, date) is
  'A workspace''s audit events for its owners and admins, newest first (keyset paging on created_at, id).';

-- -----------------------------------------------------------------------------
-- Invitations: shared acceptance, pending list, accept by id
-- -----------------------------------------------------------------------------

-- "Which open invitations are for me?" looks invitations up by address.
create index workspace_invitations_open_email_idx
  on public.workspace_invitations (email)
  where accepted_at is null and revoked_at is null;

-- The one acceptance routine behind both public paths. Locks the invitation,
-- re-checks every condition under the lock, inserts the membership with the
-- invited role and marks the invitation accepted, in the caller's
-- transaction. The workspace and role always come from the invitation row.
--   p_token_hash given (the emailed link): the row must still carry that
--     token (a resend in between makes the old link invalid).
--   p_token_hash null (the pending list, by id): the caller must first be the
--     verified invitee; anyone else learns nothing about the invitation.
-- Outcomes as accept_workspace_invitation() documents them.
create function private.accept_invitation(p_invitation_id uuid, p_token_hash text)
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

  select i.* into v_invitation
  from public.workspace_invitations i
  where i.id = p_invitation_id
  for update;

  if not found or (p_token_hash is not null and v_invitation.token_hash is distinct from p_token_hash) then
    return query select 'invalid'::text, null::text;
    return;
  end if;

  select u.email, u.email_confirmed_at into v_user_email, v_confirmed_at
  from auth.users u
  where u.id = v_user_id;

  if p_token_hash is null then
    if v_confirmed_at is null then
      return query select 'email_unverified'::text, null::text;
      return;
    end if;
    if lower(btrim(v_user_email)) is distinct from v_invitation.email then
      return query select 'invalid'::text, null::text;
      return;
    end if;
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
    jsonb_build_object(
      'invitation_id', v_invitation.id,
      'role', v_invitation.role,
      'already_member', v_inserted = 0,
      'method', case when p_token_hash is null then 'pending_list' else 'link' end
    )
  );

  return query select
    case when v_inserted = 0 then 'already_member' else 'accepted' end,
    v_slug;
end;
$$;

-- Accepts an invitation from its emailed link (unchanged signature and
-- outcomes; the work now happens in private.accept_invitation()).
--   outcome 'accepted'         joined (or this user already accepted it)
--   outcome 'already_member'   was a direct member already; kept their role
--   outcome 'invalid' | 'revoked' | 'expired' | 'already_used'
--   outcome 'email_mismatch' | 'email_unverified'
create or replace function public.accept_workspace_invitation(p_token_hash text)
returns table (outcome text, workspace_slug text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invitation_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return query select 'invalid'::text, null::text;
    return;
  end if;

  select i.id into v_invitation_id
  from public.workspace_invitations i
  where i.token_hash = p_token_hash;

  if v_invitation_id is null then
    return query select 'invalid'::text, null::text;
    return;
  end if;

  return query select * from private.accept_invitation(v_invitation_id, p_token_hash);
end;
$$;

-- Accepts one of the caller's pending invitations (see
-- list_my_pending_invitations) by id. Only the verified invitee gets anything
-- other than 'invalid' or 'email_unverified'.
create function public.accept_workspace_invitation_by_id(p_invitation_id uuid)
returns table (outcome text, workspace_slug text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  return query select * from private.accept_invitation(p_invitation_id, null);
end;
$$;

-- The open, unexpired, unrevoked invitations addressed to the caller's
-- VERIFIED email (normalised like invitations are), newest first. Nothing
-- for an unconfirmed address. Display fields and the id to accept by; never
-- the token hash.
create function public.list_my_pending_invitations()
returns table (
  invitation_id uuid,
  workspace_name text,
  role public.workspace_role,
  inviter_name text,
  expires_at timestamptz,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    i.id,
    w.name,
    i.role,
    coalesce(nullif(btrim(p.full_name), ''), p.email),
    i.expires_at,
    i.created_at
  from auth.users u
  join public.workspace_invitations i
    on i.email = lower(btrim(u.email))
    and i.accepted_at is null
    and i.revoked_at is null
    and i.expires_at > now()
  join public.workspaces w on w.id = i.workspace_id
  left join public.profiles p on p.id = i.invited_by
  where u.id = (select auth.uid())
    and u.email_confirmed_at is not null
  order by i.created_at desc
  limit 50;
$$;

-- -----------------------------------------------------------------------------
-- Privileges
-- -----------------------------------------------------------------------------

revoke all on function public.transfer_workspace_ownership(uuid, uuid) from public, anon;
grant execute on function public.transfer_workspace_ownership(uuid, uuid) to authenticated, service_role;

revoke all on function public.make_workspace_owner(uuid, uuid) from public, anon;
grant execute on function public.make_workspace_owner(uuid, uuid) to authenticated, service_role;

revoke all on function public.list_workspace_audit_events(uuid, integer, bigint, text, uuid, date, date) from public, anon;
grant execute on function public.list_workspace_audit_events(uuid, integer, bigint, text, uuid, date, date) to authenticated, service_role;

revoke all on function public.accept_workspace_invitation_by_id(uuid) from public, anon;
grant execute on function public.accept_workspace_invitation_by_id(uuid) to authenticated, service_role;

revoke all on function public.list_my_pending_invitations() from public, anon;
grant execute on function public.list_my_pending_invitations() to authenticated, service_role;

-- Internal: only the definer functions above (running as the owner) call it.
revoke all on function private.accept_invitation(uuid, text) from public;

-- =============================================================================
-- Application-level rate limit counters (Sprint 2)
--
-- Supabase Auth sees every request from our server's IP, so its per-IP limits
-- can't tell one visitor from another. The app therefore limits auth actions
-- itself, per client IP and per email (src/lib/rate-limit). This is the
-- storage behind it: fixed-window counters shared by every server instance.
--
--   * The table lives in `private` (not exposed through the Data API) and has
--     RLS enabled with no policies: only its owner can touch it.
--   * public.rate_limit_hit() is the only entry point and is executable by
--     service_role only. The public/publishable key can't call it, so nobody
--     can burn someone else's budget or read counters through the API.
--   * Keys are opaque ("<policy>:<sha-256 prefix>"): no emails or IPs are stored.
--   * Not tenant data: there is deliberately no workspace_id.
-- =============================================================================

create table private.rate_limit_counters (
  key text primary key check (char_length(key) between 1 and 200),
  hits integer not null check (hits > 0),
  window_ends_at timestamptz not null
);

comment on table private.rate_limit_counters is
  'Fixed-window rate limit counters for pre-authentication actions. Written only via public.rate_limit_hit().';

-- Expired rows are pruned by rate_limit_hit(); this keeps that delete cheap.
create index rate_limit_counters_window_ends_at_idx
  on private.rate_limit_counters (window_ends_at);

alter table private.rate_limit_counters enable row level security;
revoke all on table private.rate_limit_counters from public, anon, authenticated;

-- Records one hit against `p_key` and returns the hits in the current window
-- and when that window ends. A key whose window has ended starts over at 1.
-- The caller compares `hits` with its policy's limit.
create function public.rate_limit_hit(p_key text, p_window_seconds integer)
returns table (hits integer, window_ends_at timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_key is null or char_length(p_key) not between 1 and 200 then
    raise exception 'Invalid rate limit key' using errcode = '22023';
  end if;
  if p_window_seconds is null or p_window_seconds not between 1 and 86400 then
    raise exception 'Invalid rate limit window' using errcode = '22023';
  end if;

  return query
    insert into private.rate_limit_counters as c (key, hits, window_ends_at)
    values (p_key, 1, now() + make_interval(secs => p_window_seconds))
    on conflict (key) do update
      set hits = case when c.window_ends_at <= now() then 1 else c.hits + 1 end,
          window_ends_at = case
            when c.window_ends_at <= now() then excluded.window_ends_at
            else c.window_ends_at
          end
    returning c.hits, c.window_ends_at;

  -- Opportunistic cleanup (about 1 call in 100) keeps the table bounded
  -- without a scheduler.
  if random() < 0.01 then
    delete from private.rate_limit_counters r
    where r.window_ends_at < now() - interval '1 hour';
  end if;
end;
$$;

comment on function public.rate_limit_hit(text, integer) is
  'Counts one hit for a rate limit key in a fixed window. service_role only.';

revoke all on function public.rate_limit_hit(text, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, integer) to service_role;

-- Nov 15 2026: findings from the "Problems Found in Testing" review.
--
-- 1. proposal_usage was read and then written with the USER'S OWN session, so a signed-in user
--    could reset the counter through the API, and two tabs at once got extra drafts. The Edge
--    Function now calls consume_proposal_credit() with the service role: one atomic statement that
--    checks the plan limit and increments in the same row lock. Users keep SELECT on their own
--    rows (the app shows "N drafts left") but lose INSERT/UPDATE.
-- 2. Six functions had no per-user limit at all. bump_rate_limit() is a shared, atomic counter per
--    (user, bucket, window) that only the service role can call.
-- 3. discover-grants hit Grants.gov up to 8 times per run with no cache. grants_gov_cache stores
--    each query's raw hits for a few hours.
-- 4. profiles.tier: the plan column some live functions assumed was missing. Idempotent re-add.

-- ── 4. plan column (idempotent; same as 20260626_subscription_tiers.sql) ─────────────────────
alter table public.profiles
  add column if not exists tier text not null default 'free';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_tier_check') then
    alter table public.profiles add constraint profiles_tier_check check (tier in ('free','starter','pro'));
  end if;
end $$;

-- ── 1. draft credits: users may read their usage, only the server may change it ──────────────
drop policy if exists "own rows only" on public.proposal_usage;
drop policy if exists "read own usage" on public.proposal_usage;
create policy "read own usage" on public.proposal_usage
  for select using (auth.uid() = user_id);
-- (no insert/update/delete policies: with RLS on, only service_role can write)

create or replace function public.consume_proposal_credit(
  p_user_id uuid, p_monthly_limit int, p_today date default current_date
) returns table (allowed boolean, used_this_month int, used_today int)
language plpgsql security definer set search_path = public as $$
declare
  v_month_start date := date_trunc('month', p_today)::date;
  v_month_total int;
begin
  -- lock this user's rows for the month so concurrent calls serialize
  perform 1 from public.proposal_usage where user_id = p_user_id and used_on >= v_month_start for update;
  select coalesce(sum(count), 0) into v_month_total
    from public.proposal_usage where user_id = p_user_id and used_on >= v_month_start;
  if p_monthly_limit is not null and v_month_total >= p_monthly_limit then
    return query select false, v_month_total,
      (select coalesce(count, 0) from public.proposal_usage where user_id = p_user_id and used_on = p_today);
    return;
  end if;
  insert into public.proposal_usage (user_id, used_on, count) values (p_user_id, p_today, 1)
    on conflict (user_id, used_on) do update set count = public.proposal_usage.count + 1;
  return query select true, v_month_total + 1,
    (select count from public.proposal_usage where user_id = p_user_id and used_on = p_today);
end $$;

-- A failed generation (both AI providers down) gives the credit back.
create or replace function public.refund_proposal_credit(p_user_id uuid, p_today date default current_date)
returns void language sql security definer set search_path = public as $$
  update public.proposal_usage set count = greatest(count - 1, 0)
   where user_id = p_user_id and used_on = p_today;
$$;

revoke execute on function public.consume_proposal_credit(uuid, int, date) from public, anon, authenticated;
revoke execute on function public.refund_proposal_credit(uuid, date) from public, anon, authenticated;
grant execute on function public.consume_proposal_credit(uuid, int, date) to service_role;
grant execute on function public.refund_proposal_credit(uuid, date) to service_role;

-- ── 2. shared per-user rate limits ───────────────────────────────────────────────────────────
create table if not exists public.rate_limits (
  user_id      uuid not null references auth.users(id) on delete cascade,
  bucket       text not null,
  window_start timestamptz not null,
  count        int not null default 0,
  primary key (user_id, bucket, window_start)
);
alter table public.rate_limits enable row level security;   -- no policies: service role only
create index if not exists idx_rate_limits_window on public.rate_limits (window_start);

create or replace function public.bump_rate_limit(
  p_user_id uuid, p_bucket text, p_limit int, p_window_seconds int
) returns table (allowed boolean, count int, retry_after_seconds int)
language plpgsql security definer set search_path = public as $$
declare
  v_now timestamptz := now();
  v_window_start timestamptz;
  v_count int;
begin
  -- fixed windows aligned to the epoch, e.g. every 60 s or every 24 h
  v_window_start := to_timestamp(floor(extract(epoch from v_now) / p_window_seconds) * p_window_seconds);
  insert into public.rate_limits (user_id, bucket, window_start, count)
    values (p_user_id, p_bucket, v_window_start, 1)
    on conflict (user_id, bucket, window_start) do update set count = public.rate_limits.count + 1
    returning public.rate_limits.count into v_count;
  -- opportunistic cleanup of old windows (cheap; keeps the table small)
  if random() < 0.02 then
    delete from public.rate_limits where window_start < v_now - interval '2 days';
  end if;
  return query select v_count <= p_limit, v_count,
    greatest(1, ceil(extract(epoch from (v_window_start + make_interval(secs => p_window_seconds) - v_now)))::int);
end $$;

revoke execute on function public.bump_rate_limit(uuid, text, int, int) from public, anon, authenticated;
grant execute on function public.bump_rate_limit(uuid, text, int, int) to service_role;

-- ── 3. Grants.gov response cache ─────────────────────────────────────────────────────────────
create table if not exists public.grants_gov_cache (
  cache_key  text primary key,          -- sha-256 of the search2 request body
  hits       jsonb not null,
  fetched_at timestamptz not null default now()
);
alter table public.grants_gov_cache enable row level security;   -- service role only
create index if not exists idx_grants_gov_cache_fetched on public.grants_gov_cache (fetched_at);

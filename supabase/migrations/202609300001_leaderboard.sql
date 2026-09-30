-- Optional Supabase leaderboard. Apply with an administrative migration role.
-- Public keys are not secrets; authorization is enforced below, not in the browser.
begin;

create table public.plp_seasons (
  id text primary key check (id ~ '^[a-z0-9][a-z0-9_-]{2,39}$'),
  accepting_runs boolean not null default false
);
insert into public.plp_seasons (id, accepting_runs) values ('savane-2026-2', true);

create table public.plp_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  friend_code text not null unique check (friend_code ~ '^[A-Z0-9]{10}$'),
  display_name text,
  last_start_at timestamptz,
  last_finish_at timestamptz,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint plp_profile_name check (display_name is null or
    (char_length(display_name) between 3 and 20 and display_name !~ '[[:cntrl:]]'
     and display_name ~ '^[[:alnum:] _-]+$'))
);
create table public.plp_runs (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  player_id uuid not null references public.plp_profiles(id) on delete cascade,
  season text not null references public.plp_seasons(id),
  level integer not null check (level between 1 and 99),
  upgrades jsonb not null check (jsonb_typeof(upgrades) = 'object'),
  mission text not null check (mission in ('campaign', 'breakthrough', 'survival', 'hunt', 'rescue', 'sanctuary')),
  started_at timestamptz not null default pg_catalog.clock_timestamp(),
  finished_at timestamptz,
  status text not null default 'active' check (status in ('active', 'submitted', 'abandoned')),
  kills integer check (kills between 0 and 130785),
  duration integer check (duration between 1 and 3600),
  won boolean,
  score bigint,
  constraint plp_run_finished check ((status = 'active' and finished_at is null) or
                                    (status <> 'active' and finished_at is not null))
);
create unique index plp_one_active_run on public.plp_runs(player_id) where status = 'active';
create index plp_runs_cleanup on public.plp_runs(started_at);
create table public.plp_scores (
  season text not null references public.plp_seasons(id),
  player_id uuid not null references public.plp_profiles(id) on delete cascade,
  score bigint not null check (score >= 0),
  level integer not null check (level between 1 and 99),
  achieved_at timestamptz not null,
  primary key (season, player_id)
);
create index plp_scores_top on public.plp_scores(season, score desc, achieved_at, player_id);

alter table public.plp_seasons enable row level security;
alter table public.plp_profiles enable row level security;
alter table public.plp_runs enable row level security;
alter table public.plp_scores enable row level security;
-- No client table policies: every access goes through the narrowly scoped RPCs.
revoke all on public.plp_seasons, public.plp_profiles, public.plp_runs, public.plp_scores
  from public, anon, authenticated;

create function public.plp_start_run(p_level integer, p_upgrades jsonb, p_mission text, p_season text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_profile public.plp_profiles%rowtype;
  v_code text;
  v_run uuid;
  v_pair record;
  v_upgrades jsonb := coalesce(p_upgrades, '{}'::jsonb);
begin
  if v_uid is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if p_level is null or p_level not between 1 and 99 then raise exception 'Invalid level'; end if;
  if p_mission is null or p_mission not in ('campaign', 'breakthrough', 'survival', 'hunt', 'rescue', 'sanctuary') then
    raise exception 'Invalid mission';
  end if;
  if p_season is null or not exists (select 1 from public.plp_seasons s where s.id = p_season and s.accepting_runs) then
    raise exception 'Season is not accepting runs';
  end if;
  if jsonb_typeof(v_upgrades) <> 'object' then raise exception 'Invalid upgrades'; end if;
  for v_pair in select key, value from pg_catalog.jsonb_each(v_upgrades) loop
    if v_pair.key not in ('recruits', 'power', 'rate') or jsonb_typeof(v_pair.value) <> 'number' then
      raise exception 'Invalid upgrade';
    end if;
    if (v_pair.value #>> '{}')::numeric not between 0 and 40
       or (v_pair.value #>> '{}')::numeric <> trunc((v_pair.value #>> '{}')::numeric) then
      raise exception 'Upgrade out of range';
    end if;
  end loop;
  -- Retry rare random-code collisions; ON CONFLICT(id) handles concurrent signup.
  loop
    v_code := upper(substr(replace(pg_catalog.gen_random_uuid()::text, '-', ''), 1, 10));
    begin
      insert into public.plp_profiles(id, friend_code) values (v_uid, v_code)
        on conflict (id) do nothing;
      exit;
    exception when unique_violation then null;
    end;
  end loop;
  select * into v_profile from public.plp_profiles p where p.id = v_uid for update;
  v_now := pg_catalog.clock_timestamp();
  if v_profile.last_start_at > v_now - interval '5 seconds' then raise exception 'Wait before starting another run'; end if;
  -- One live ticket per identity. Starting again cancels any previous pending ticket.
  update public.plp_runs set status = 'abandoned', finished_at = v_now
    where player_id = v_uid and status = 'active';
  insert into public.plp_runs(player_id, season, level, upgrades, mission, started_at)
    values (v_uid, p_season, p_level, v_upgrades, p_mission, v_now) returning id into v_run;
  update public.plp_profiles set last_start_at = v_now where id = v_uid;
  return jsonb_build_object('run_id', v_run, 'friend_code', v_profile.friend_code);
end;
$$;

create function public.plp_finish_run(p_run uuid, p_name text, p_kills integer, p_duration integer, p_won boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_now timestamptz;
  v_profile public.plp_profiles%rowtype;
  v_run public.plp_runs%rowtype;
  v_name text := btrim(p_name);
  v_score bigint;
  v_best bigint;
  v_elapsed numeric;
begin
  if v_uid is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if v_name is null or char_length(v_name) not between 3 and 20
    or v_name ~ '[[:cntrl:]]' or v_name !~ '^[[:alnum:] _-]+$' then raise exception 'Invalid display name'; end if;
  if p_kills is null or p_duration is null or p_won is null or p_duration not between 1 and 3600 then
    raise exception 'Invalid result';
  end if;
  -- Always lock the profile first, matching start_run and serializing concurrent submissions.
  select * into v_profile from public.plp_profiles p where p.id = v_uid for update;
  if not found then raise exception 'Start a run first'; end if;
  select * into v_run from public.plp_runs r where r.id = p_run and r.player_id = v_uid for update;
  if not found or v_run.status <> 'active' then raise exception 'Run is unavailable or already used'; end if;
  v_now := pg_catalog.clock_timestamp();
  if v_profile.last_finish_at > v_now - interval '15 seconds' then raise exception 'Wait before submitting another result'; end if;
  v_elapsed := extract(epoch from v_now - v_run.started_at);
  if v_elapsed < 1 or v_elapsed > 7200 or p_duration > v_elapsed + 2 then raise exception 'Invalid run duration'; end if;
  if p_kills < 0 or p_kills > 20 * (203 + 64 * v_run.level) + 5 then raise exception 'Kill count out of range'; end if;
  if p_won and p_duration < 30 then raise exception 'Victory duration is implausible'; end if;
  -- Client never supplies the score. These checks bound claims, not gameplay truth.
  v_score := p_kills::bigint * 10 + case when p_won then v_run.level::bigint * 1000 else 0 end;
  update public.plp_runs set status = 'submitted', finished_at = v_now, kills = p_kills,
    duration = p_duration, won = p_won, score = v_score where id = v_run.id;
  -- Opt-in happens only here: starting a run never publishes a name or board entry.
  update public.plp_profiles set display_name = v_name, last_finish_at = v_now where id = v_uid;
  insert into public.plp_scores as previous(season, player_id, score, level, achieved_at)
    values(v_run.season, v_uid, v_score, v_run.level, v_now)
    on conflict(season, player_id) do update
      set score = excluded.score, level = excluded.level, achieved_at = excluded.achieved_at
      where excluded.score > previous.score;
  select s.score into v_best from public.plp_scores s where s.season = v_run.season and s.player_id = v_uid;
  return jsonb_build_object('score', v_score, 'best_score', v_best, 'level', v_run.level, 'season', v_run.season);
end;
$$;

create function public.plp_leaderboard(p_season text, p_codes text[] default null)
returns table(rank bigint, name text, score bigint, level integer)
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_season is null or char_length(p_season) > 40 or p_season !~ '^[a-z0-9][a-z0-9_-]{2,39}$' then
    raise exception 'Invalid season';
  end if;
  if p_codes is not null and (coalesce(array_ndims(p_codes), 1) <> 1 or cardinality(p_codes) > 50) then
    raise exception 'At most 50 friend codes are allowed';
  end if;
  if p_codes is not null and exists (select 1 from unnest(p_codes) as c(code) where c.code is null or c.code !~ '^[A-Z0-9]{10}$') then
    raise exception 'Invalid friend code';
  end if;
  -- Filter before rank: friend ranks are within this friend list, world ranks within the season.
  return query
    select row_number() over (order by s.score desc, s.achieved_at, s.player_id),
      p.display_name, s.score, s.level
    from public.plp_scores s join public.plp_profiles p on p.id = s.player_id
    where s.season = p_season and p.display_name is not null
      and (p_codes is null or p.friend_code = any(p_codes))
    order by s.score desc, s.achieved_at, s.player_id limit 100;
end;
$$;

revoke all on function public.plp_start_run(integer, jsonb, text, text) from public, anon, authenticated;
revoke all on function public.plp_finish_run(uuid, text, integer, integer, boolean) from public, anon, authenticated;
revoke all on function public.plp_leaderboard(text, text[]) from public, anon, authenticated;
grant execute on function public.plp_start_run(integer, jsonb, text, text) to authenticated;
grant execute on function public.plp_finish_run(uuid, text, integer, integer, boolean) to authenticated;
grant execute on function public.plp_leaderboard(text, text[]) to anon, authenticated;
commit;

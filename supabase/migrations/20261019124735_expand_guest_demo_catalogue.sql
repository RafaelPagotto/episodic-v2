-- Expand only the guest allowlist; shared metadata and existing sessions stay untouched.
alter table public.demo_catalogue drop constraint demo_catalogue_curated_ids;
alter table public.demo_catalogue add constraint demo_catalogue_curated_ids check (
  show_tmdb_id in (1396,70523,95396,125988,2316,106379,60059,87108,67070,83867,
    76331,100088,42009,48891,61222,246,30991,40075,93740,63247,1398)
);
alter table public.demo_catalogue drop constraint demo_catalogue_display_order_check;
alter table public.demo_catalogue add constraint demo_catalogue_display_order_check
  check (display_order between 0 and 20);

create or replace function private.seed_guest_demo(
  p_user_id uuid, p_timezone text, p_expected_timezone text, p_library jsonb, p_watched jsonb, p_reset boolean
) returns void language plpgsql security definer set search_path = '' as $$
declare
  guest public.guest_sessions%rowtype;
  existing_timezone text;
  expected_ids integer[];
begin
  perform 1 from auth.users where id = p_user_id and is_anonymous for update;
  if not found then raise exception 'Demo access required'; end if;
  select * into guest from public.guest_sessions where user_id = p_user_id for update;
  if not found or guest.expires_at <= clock_timestamp() then raise exception 'Demo expired'; end if;
  if guest.seeded_at is not null and not p_reset then return; end if;
  if p_reset and guest.last_reset_at > now() - interval '10 seconds' then raise exception 'Try again shortly'; end if;
  select timezone into existing_timezone from public.profiles where id = p_user_id for update;
  if existing_timezone is distinct from p_expected_timezone then raise exception 'Timezone changed; retry demo initialization'; end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = p_timezone)
    or jsonb_typeof(p_library) is distinct from 'array' or jsonb_typeof(p_watched) is distinct from 'array'
    then raise exception 'Invalid demo seed'; end if;

  -- Keep the original five-show payload valid during the migration-first rollout.
  if jsonb_array_length(p_library) = 5 then
    expected_ids := array[1396,70523,95396,125988,2316];
  elsif jsonb_array_length(p_library) = 20 then
    expected_ids := array[1396,70523,95396,125988,2316,60059,87108,67070,83867,
      76331,100088,42009,48891,61222,246,30991,40075,93740,63247,1398];
  else
    raise exception 'Invalid demo seed';
  end if;
  if (select count(distinct x.show_tmdb_id) from jsonb_to_recordset(p_library) as x(show_tmdb_id int)
      where x.show_tmdb_id = any(expected_ids)) <> cardinality(expected_ids)
    or (select count(*) from public.demo_catalogue where show_tmdb_id = any(expected_ids)) <> cardinality(expected_ids)
    or not exists (select 1 from public.demo_catalogue where show_tmdb_id = 106379)
    then raise exception 'Demo catalogue unavailable'; end if;
  if exists (select 1 from jsonb_to_recordset(p_watched) as x(show_tmdb_id int, season_number int, episode_number int)
    where x.season_number is null or x.season_number <= 0 or x.episode_number is null or x.episode_number <= 0
      or x.show_tmdb_id is null or not (x.show_tmdb_id = any(expected_ids)))
    then raise exception 'Invalid demo progress'; end if;

  delete from public.user_shows where user_id = p_user_id;
  insert into public.user_shows(user_id, show_tmdb_id, status, favourite)
    select p_user_id, x.show_tmdb_id, x.status::public.show_watch_status, x.favourite
    from jsonb_to_recordset(p_library) as x(show_tmdb_id int, status text, favourite boolean);
  insert into public.watched_episodes(user_id, show_tmdb_id, season_number, episode_number)
    select p_user_id, x.show_tmdb_id, x.season_number, x.episode_number
    from jsonb_to_recordset(p_watched) as x(show_tmdb_id int, season_number int, episode_number int);
  insert into public.profiles(id, display_name, timezone) values(p_user_id, 'Guest', p_timezone)
    on conflict(id) do update set timezone = coalesce(public.profiles.timezone, excluded.timezone);
  delete from public.user_preferences where user_id = p_user_id;
  insert into public.user_preferences(user_id) values(p_user_id);
  update public.guest_sessions set seeded_at = now(),
    last_reset_at = case when p_reset then now() else last_reset_at end where user_id = p_user_id;
end;
$$;
revoke all on function private.seed_guest_demo(uuid,text,text,jsonb,jsonb,boolean) from public, anon, authenticated;
grant execute on function private.seed_guest_demo(uuid,text,text,jsonb,jsonb,boolean) to service_role;

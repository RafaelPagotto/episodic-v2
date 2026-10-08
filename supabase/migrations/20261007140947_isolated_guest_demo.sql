create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

create table public.guest_sessions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  seeded_at timestamptz,
  last_reset_at timestamptz
);
create index guest_sessions_expiry_idx on public.guest_sessions(expires_at, user_id);
create table public.demo_catalogue (
  show_tmdb_id integer primary key references public.shows(tmdb_id) on delete restrict,
  display_order integer not null unique check (display_order between 0 and 5),
  constraint demo_catalogue_curated_ids check (show_tmdb_id in (1396,70523,95396,125988,2316,106379))
);
alter table public.guest_sessions enable row level security;
alter table public.demo_catalogue enable row level security;
revoke all on public.guest_sessions, public.demo_catalogue from anon, authenticated;
grant select on public.guest_sessions, public.demo_catalogue to authenticated;
grant all on public.guest_sessions, public.demo_catalogue to service_role;
create policy guest_sessions_select_own on public.guest_sessions for select to authenticated
  using (user_id = (select auth.uid()));
create policy demo_catalogue_read on public.demo_catalogue for select to authenticated using (true);

create function private.register_guest()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.is_anonymous then
    insert into public.guest_sessions(user_id, expires_at)
    values (new.id, new.created_at + interval '72 hours') on conflict (user_id) do nothing;
  end if;
  return new;
end;
$$;
revoke all on function private.register_guest() from public, anon, authenticated;
create trigger on_auth_guest_created after insert on auth.users
for each row execute function private.register_guest();
insert into public.guest_sessions(user_id, expires_at)
select id, created_at + interval '72 hours' from auth.users where is_anonymous
on conflict (user_id) do nothing;

-- This private lookup avoids recursive RLS and reads server-owned state only.
create function private.guest_access_allowed()
returns boolean language sql stable security definer set search_path = '' as $$
  select not coalesce((auth.jwt()->>'is_anonymous')::boolean, false)
    or exists (
      select 1 from public.guest_sessions
      where user_id = auth.uid() and seeded_at is not null and expires_at > now()
    );
$$;
revoke all on function private.guest_access_allowed() from public, anon;
grant execute on function private.guest_access_allowed() to authenticated;

create policy guest_profile_access on public.profiles as restrictive for all to authenticated
using ((select private.guest_access_allowed())) with check ((select private.guest_access_allowed()));
create policy guest_preferences_access on public.user_preferences as restrictive for all to authenticated
using ((select private.guest_access_allowed())) with check ((select private.guest_access_allowed()));

create policy guest_catalogue_access on public.demo_catalogue as restrictive for select to authenticated
using ((select private.guest_access_allowed()));

create policy guest_show_access on public.shows as restrictive for select to authenticated using (
  (select private.guest_access_allowed()) and (
    not coalesce((select auth.jwt()->>'is_anonymous')::boolean, false)
    or tmdb_id in (select show_tmdb_id from public.demo_catalogue)
  )
);
create policy guest_season_access on public.seasons as restrictive for select to authenticated using (
  (select private.guest_access_allowed()) and (
    not coalesce((select auth.jwt()->>'is_anonymous')::boolean, false)
    or show_tmdb_id in (select show_tmdb_id from public.demo_catalogue)
  )
);
create policy guest_episode_access on public.episodes as restrictive for select to authenticated using (
  (select private.guest_access_allowed()) and (
    not coalesce((select auth.jwt()->>'is_anonymous')::boolean, false)
    or show_tmdb_id in (select show_tmdb_id from public.demo_catalogue)
  )
);
create policy guest_library_access on public.user_shows as restrictive for all to authenticated
using (
  (select private.guest_access_allowed()) and (
    not coalesce((select auth.jwt()->>'is_anonymous')::boolean, false)
    or show_tmdb_id in (select show_tmdb_id from public.demo_catalogue)
  )
) with check (
  (select private.guest_access_allowed()) and (
    not coalesce((select auth.jwt()->>'is_anonymous')::boolean, false)
    or show_tmdb_id in (select show_tmdb_id from public.demo_catalogue)
  )
);
create policy guest_watched_access on public.watched_episodes as restrictive for all to authenticated
using (
  (select private.guest_access_allowed()) and (
    not coalesce((select auth.jwt()->>'is_anonymous')::boolean, false)
    or show_tmdb_id in (select show_tmdb_id from public.demo_catalogue)
  )
) with check (
  (select private.guest_access_allowed()) and (
    not coalesce((select auth.jwt()->>'is_anonymous')::boolean, false)
    or show_tmdb_id in (select show_tmdb_id from public.demo_catalogue)
  )
);

create function private.seed_guest_demo(
  p_user_id uuid, p_timezone text, p_expected_timezone text, p_library jsonb, p_watched jsonb, p_reset boolean
) returns void language plpgsql security definer set search_path = '' as $$
declare
  guest public.guest_sessions%rowtype;
  existing_timezone text;
begin
  -- Lock Auth first, consistently with cleanup and identity conversion.
  perform 1 from auth.users where id = p_user_id and is_anonymous for update;
  if not found then raise exception 'Demo access required'; end if;
  select * into guest from public.guest_sessions where user_id = p_user_id for update;
  if not found or guest.expires_at <= clock_timestamp() then raise exception 'Demo expired'; end if;
  if guest.seeded_at is not null and not p_reset then return; end if;
  if p_reset and guest.last_reset_at > now() - interval '10 seconds' then raise exception 'Try again shortly'; end if;
  select timezone into existing_timezone from public.profiles where id = p_user_id for update;
  if existing_timezone is distinct from p_expected_timezone then raise exception 'Timezone changed; retry demo initialization'; end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = p_timezone)
    or jsonb_typeof(p_library) <> 'array' or jsonb_typeof(p_watched) <> 'array'
    or jsonb_array_length(p_library) <> 5 then raise exception 'Invalid demo seed'; end if;
  if (select count(distinct x.show_tmdb_id) from jsonb_to_recordset(p_library) as x(show_tmdb_id int)
      where x.show_tmdb_id in (1396,70523,95396,125988,2316)) <> 5
    or (select count(*) from public.demo_catalogue) <> 6 then raise exception 'Demo catalogue unavailable'; end if;
  if exists (select 1 from jsonb_to_recordset(p_watched) as x(show_tmdb_id int, season_number int, episode_number int)
    where x.season_number <= 0 or x.episode_number <= 0 or x.show_tmdb_id not in (1396,70523,95396,125988,2316))
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
create function public.seed_guest_demo(p_user_id uuid, p_timezone text, p_expected_timezone text, p_library jsonb, p_watched jsonb, p_reset boolean)
returns void language sql security invoker set search_path = '' as $$
  select private.seed_guest_demo(p_user_id, p_timezone, p_expected_timezone, p_library, p_watched, p_reset);
$$;
revoke all on function public.seed_guest_demo(uuid,text,text,jsonb,jsonb,boolean) from public, anon, authenticated;
grant execute on function public.seed_guest_demo(uuid,text,text,jsonb,jsonb,boolean) to service_role;

create function private.metadata_refresh_eligible_library_rows()
returns table(id bigint, show_tmdb_id integer) language sql stable security definer set search_path = '' as $$
  select library.id, library.show_tmdb_id from public.user_shows library
  join auth.users account on account.id = library.user_id
  where library.status <> 'dropped' and not coalesce(account.is_anonymous, false);
$$;
revoke all on function private.metadata_refresh_eligible_library_rows() from public, anon, authenticated;
grant execute on function private.metadata_refresh_eligible_library_rows() to service_role;
create function public.metadata_refresh_eligible_library_rows()
returns table(id bigint, show_tmdb_id integer) language sql stable security invoker set search_path = '' as $$
  select * from private.metadata_refresh_eligible_library_rows();
$$;
revoke all on function public.metadata_refresh_eligible_library_rows() from public, anon, authenticated;
grant execute on function public.metadata_refresh_eligible_library_rows() to service_role;

create function private.cleanup_guest_accounts(p_dry_run boolean)
returns table(eligible bigint, deleted bigint, remaining bigint)
language plpgsql security definer set search_path = '' as $$
declare removed bigint := 0; total bigint; account_id uuid;
begin
  select count(*) into total from public.guest_sessions guest join auth.users account on account.id = guest.user_id
    where guest.expires_at <= now() and account.is_anonymous;
  if not p_dry_run then
    for account_id in
      select account.id from auth.users account join public.guest_sessions guest on guest.user_id = account.id
      where guest.expires_at <= now() and account.is_anonymous
      order by guest.expires_at, guest.user_id limit 100 for update of account skip locked
    loop
      -- Recheck under the Auth row lock; a concurrent conversion must never be deleted.
      delete from auth.sessions where user_id = account_id;
      delete from auth.users where id = account_id and is_anonymous;
      if found then removed := removed + 1; end if;
    end loop;
    delete from public.guest_sessions guest using auth.users account
      where guest.user_id = account.id and not coalesce(account.is_anonymous, false);
  end if;
  return query select total, removed, greatest(total - removed, 0::bigint);
end;
$$;
revoke all on function private.cleanup_guest_accounts(boolean) from public, anon, authenticated;
grant execute on function private.cleanup_guest_accounts(boolean) to service_role;
create function public.cleanup_guest_accounts(p_dry_run boolean)
returns table(eligible bigint, deleted bigint, remaining bigint)
language sql security invoker set search_path = '' as $$ select * from private.cleanup_guest_accounts(p_dry_run); $$;
revoke all on function public.cleanup_guest_accounts(boolean) from public, anon, authenticated;
grant execute on function public.cleanup_guest_accounts(boolean) to service_role;

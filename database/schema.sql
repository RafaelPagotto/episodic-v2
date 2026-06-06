-- Episodic v2 database schema.
-- Intended for a fresh v2 Supabase project or a reviewed migration branch.

do $$
begin
  create type public.show_watch_status as enum (
    'watchlist',
    'watching',
    'watched',
    'dropped'
  );
exception
  when duplicate_object then null;
end $$;

comment on type public.show_watch_status is
  'User-facing library status for a show in one user account.';

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'Keeps updated_at columns current for mutable Episodic tables.';

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  timezone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'One row per Supabase auth user for public account display data.';
comment on column public.profiles.id is
  'Matches auth.users.id and is owned by the same user.';
comment on column public.profiles.display_name is
  'Display name shown inside the app.';
comment on column public.profiles.avatar_url is
  'Optional user avatar URL for future profile UI.';
comment on column public.profiles.timezone is
  'Optional IANA timezone for date-sensitive episode displays.';

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  fade_dropped boolean not null default true,
  hide_dropped boolean not null default false,
  hide_completed boolean not null default false,
  search_fade_added boolean not null default true,
  search_hide_added boolean not null default false,
  library_sort text not null default 'title',
  library_sort_direction text not null default 'asc',
  library_status_order text[] not null default array['watching', 'watchlist', 'watched', 'dropped'],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_preferences_library_sort_check
    check (library_sort in ('title', 'progress', 'added', 'status')),
  constraint user_preferences_library_sort_direction_check
    check (library_sort_direction in ('asc', 'desc')),
  constraint user_preferences_library_status_order_check
    check (
      array_length(library_status_order, 1) = 4
      and library_status_order @> array['watchlist', 'watching', 'watched', 'dropped']
      and library_status_order <@ array['watchlist', 'watching', 'watched', 'dropped']
    )
);

comment on table public.user_preferences is
  'Per-user UI preferences and library display settings.';
comment on column public.user_preferences.user_id is
  'Owner of the preferences row.';
comment on column public.user_preferences.library_status_order is
  'Preferred status order when sorting the library by status.';

drop trigger if exists set_user_preferences_updated_at on public.user_preferences;
create trigger set_user_preferences_updated_at
before update on public.user_preferences
for each row execute function public.set_updated_at();

create table if not exists public.shows (
  tmdb_id integer primary key,
  title text not null,
  original_title text,
  overview text,
  poster_path text,
  backdrop_path text,
  first_air_date date,
  last_air_date date,
  tmdb_status text,
  original_language text,
  popularity numeric,
  vote_average numeric,
  vote_count integer,
  genres jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shows_tmdb_id_positive_check check (tmdb_id > 0),
  constraint shows_genres_array_check check (jsonb_typeof(genres) = 'array'),
  constraint shows_metadata_object_check check (jsonb_typeof(metadata) = 'object')
);

comment on table public.shows is
  'Shared TMDB show metadata. User-specific state lives in user_shows.';
comment on column public.shows.tmdb_id is
  'TMDB TV show id.';
comment on column public.shows.genres is
  'TMDB genre data stored as JSON for flexible display and filtering.';
comment on column public.shows.metadata is
  'Additional trusted TMDB payload fields that do not need first-class columns yet.';

drop trigger if exists set_shows_updated_at on public.shows;
create trigger set_shows_updated_at
before update on public.shows
for each row execute function public.set_updated_at();

create table if not exists public.seasons (
  id bigint generated always as identity primary key,
  show_tmdb_id integer not null references public.shows(tmdb_id) on delete cascade,
  tmdb_id integer,
  season_number integer not null,
  name text not null,
  overview text,
  poster_path text,
  air_date date,
  episode_count integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint seasons_show_season_unique unique (show_tmdb_id, season_number),
  constraint seasons_season_number_check check (season_number >= 0),
  constraint seasons_episode_count_check check (episode_count >= 0),
  constraint seasons_metadata_object_check check (jsonb_typeof(metadata) = 'object')
);

comment on table public.seasons is
  'Shared TMDB season metadata for a show.';
comment on column public.seasons.season_number is
  'TMDB season number. Season 0 is allowed for specials, though UI may hide it.';
comment on column public.seasons.episode_count is
  'TMDB-reported episode count for the season.';

drop trigger if exists set_seasons_updated_at on public.seasons;
create trigger set_seasons_updated_at
before update on public.seasons
for each row execute function public.set_updated_at();

create table if not exists public.episodes (
  id bigint generated always as identity primary key,
  show_tmdb_id integer not null,
  season_number integer not null,
  episode_number integer not null,
  tmdb_id integer,
  title text not null,
  overview text,
  air_date date,
  runtime_minutes integer,
  still_path text,
  episode_key text generated always as (
    'S' || season_number::text || 'E' || episode_number::text
  ) stored,
  metadata jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint episodes_show_season_episode_unique
    unique (show_tmdb_id, season_number, episode_number),
  constraint episodes_season_number_check check (season_number >= 0),
  constraint episodes_episode_number_check check (episode_number > 0),
  constraint episodes_runtime_minutes_check check (runtime_minutes is null or runtime_minutes >= 0),
  constraint episodes_metadata_object_check check (jsonb_typeof(metadata) = 'object'),
  constraint episodes_show_fk
    foreign key (show_tmdb_id)
    references public.shows(tmdb_id)
    on delete cascade,
  constraint episodes_season_fk
    foreign key (show_tmdb_id, season_number)
    references public.seasons(show_tmdb_id, season_number)
    on delete cascade
);

comment on table public.episodes is
  'Shared TMDB episode metadata. Watched progress lives in watched_episodes.';
comment on column public.episodes.episode_key is
  'Generated compatibility label such as S1E3 for display and export.';

drop trigger if exists set_episodes_updated_at on public.episodes;
create trigger set_episodes_updated_at
before update on public.episodes
for each row execute function public.set_updated_at();

create or replace function public.set_user_show_status_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    new.status_updated_at = now();
  end if;

  return new;
end;
$$;

comment on function public.set_user_show_status_updated_at() is
  'Updates status_updated_at only when a user changes a show status.';

create table if not exists public.user_shows (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  show_tmdb_id integer not null references public.shows(tmdb_id) on delete restrict,
  status public.show_watch_status not null default 'watchlist',
  favourite boolean not null default false,
  added_at timestamptz not null default now(),
  status_updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_shows_user_show_unique unique (user_id, show_tmdb_id)
);

comment on table public.user_shows is
  'User-owned library rows linking an account to shared TMDB show metadata.';
comment on column public.user_shows.status is
  'User-selected show status. Progress calculations should share one feature module.';
comment on column public.user_shows.favourite is
  'Per-user favourite flag for library filtering and highlighting.';

drop trigger if exists set_user_shows_updated_at on public.user_shows;
create trigger set_user_shows_updated_at
before update on public.user_shows
for each row execute function public.set_updated_at();

drop trigger if exists set_user_show_status_updated_at on public.user_shows;
create trigger set_user_show_status_updated_at
before update on public.user_shows
for each row execute function public.set_user_show_status_updated_at();

create table if not exists public.watched_episodes (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  show_tmdb_id integer not null,
  season_number integer not null,
  episode_number integer not null,
  episode_key text generated always as (
    'S' || season_number::text || 'E' || episode_number::text
  ) stored,
  watched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint watched_episodes_user_episode_unique
    unique (user_id, show_tmdb_id, season_number, episode_number),
  constraint watched_episodes_library_fk
    foreign key (user_id, show_tmdb_id)
    references public.user_shows(user_id, show_tmdb_id)
    on delete cascade,
  constraint watched_episodes_episode_fk
    foreign key (show_tmdb_id, season_number, episode_number)
    references public.episodes(show_tmdb_id, season_number, episode_number)
    on delete cascade
);

comment on table public.watched_episodes is
  'User-owned episode-level watched progress.';
comment on column public.watched_episodes.watched_at is
  'Timestamp when the user marked the episode watched.';
comment on column public.watched_episodes.episode_key is
  'Generated compatibility label such as S1E3 for display and export.';

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;

  insert into public.user_preferences (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

comment on function public.handle_new_user() is
  'Creates default profile and preferences rows after Supabase Auth user creation.';

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Episodic v2 supporting indexes.
-- Migration 3 of 3.
-- Apply after 20260604000200_enable_rls_and_policies.sql.

create index if not exists idx_profiles_updated_at
on public.profiles(updated_at desc);

create index if not exists idx_shows_title
on public.shows(title);

create index if not exists idx_shows_first_air_date
on public.shows(first_air_date desc);

create index if not exists idx_seasons_show_tmdb_id
on public.seasons(show_tmdb_id);

create index if not exists idx_seasons_show_number
on public.seasons(show_tmdb_id, season_number);

create index if not exists idx_episodes_show_tmdb_id
on public.episodes(show_tmdb_id);

create index if not exists idx_episodes_show_season
on public.episodes(show_tmdb_id, season_number);

create index if not exists idx_episodes_air_date
on public.episodes(air_date);

create index if not exists idx_user_shows_user_id
on public.user_shows(user_id);

create index if not exists idx_user_shows_user_status
on public.user_shows(user_id, status);

create index if not exists idx_user_shows_user_favourite
on public.user_shows(user_id, favourite)
where favourite = true;

create index if not exists idx_user_shows_show_tmdb_id
on public.user_shows(show_tmdb_id);

create index if not exists idx_watched_episodes_user_id
on public.watched_episodes(user_id);

create index if not exists idx_watched_episodes_user_show
on public.watched_episodes(user_id, show_tmdb_id);

create index if not exists idx_watched_episodes_user_show_season
on public.watched_episodes(user_id, show_tmdb_id, season_number);

create index if not exists idx_watched_episodes_watched_at
on public.watched_episodes(user_id, watched_at desc);

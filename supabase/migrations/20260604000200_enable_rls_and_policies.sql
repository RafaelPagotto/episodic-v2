-- Episodic v2 Row Level Security policies.
-- Migration 2 of 3.
-- Apply after 20260604000100_create_core_schema.sql.

alter table public.profiles enable row level security;
alter table public.user_preferences enable row level security;
alter table public.shows enable row level security;
alter table public.seasons enable row level security;
alter table public.episodes enable row level security;
alter table public.user_shows enable row level security;
alter table public.watched_episodes enable row level security;

-- Profiles: users can manage only their own profile row.
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
for select to authenticated
using ((select auth.uid()) = id);
comment on policy profiles_select_own on public.profiles is
  'Authenticated users can read only their own profile.';

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
for insert to authenticated
with check ((select auth.uid()) = id);
comment on policy profiles_insert_own on public.profiles is
  'Authenticated users can create only their own profile.';

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
for update to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);
comment on policy profiles_update_own on public.profiles is
  'Authenticated users can update only their own profile.';

drop policy if exists profiles_delete_own on public.profiles;
create policy profiles_delete_own on public.profiles
for delete to authenticated
using ((select auth.uid()) = id);
comment on policy profiles_delete_own on public.profiles is
  'Authenticated users can delete only their own profile row.';

-- Preferences: users can manage only their own UI preferences.
drop policy if exists user_preferences_select_own on public.user_preferences;
create policy user_preferences_select_own on public.user_preferences
for select to authenticated
using ((select auth.uid()) = user_id);
comment on policy user_preferences_select_own on public.user_preferences is
  'Authenticated users can read only their own preferences.';

drop policy if exists user_preferences_insert_own on public.user_preferences;
create policy user_preferences_insert_own on public.user_preferences
for insert to authenticated
with check ((select auth.uid()) = user_id);
comment on policy user_preferences_insert_own on public.user_preferences is
  'Authenticated users can create only their own preferences.';

drop policy if exists user_preferences_update_own on public.user_preferences;
create policy user_preferences_update_own on public.user_preferences
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
comment on policy user_preferences_update_own on public.user_preferences is
  'Authenticated users can update only their own preferences.';

drop policy if exists user_preferences_delete_own on public.user_preferences;
create policy user_preferences_delete_own on public.user_preferences
for delete to authenticated
using ((select auth.uid()) = user_id);
comment on policy user_preferences_delete_own on public.user_preferences is
  'Authenticated users can delete only their own preferences.';

-- Shared TMDB metadata: authenticated users can read it, but client writes are denied.
-- Future trusted server routes or Supabase Edge Functions may upsert this data with service role.
drop policy if exists shows_select_authenticated on public.shows;
create policy shows_select_authenticated on public.shows
for select to authenticated
using (true);
comment on policy shows_select_authenticated on public.shows is
  'Authenticated users can read shared TMDB show metadata.';

drop policy if exists seasons_select_authenticated on public.seasons;
create policy seasons_select_authenticated on public.seasons
for select to authenticated
using (true);
comment on policy seasons_select_authenticated on public.seasons is
  'Authenticated users can read shared TMDB season metadata.';

drop policy if exists episodes_select_authenticated on public.episodes;
create policy episodes_select_authenticated on public.episodes
for select to authenticated
using (true);
comment on policy episodes_select_authenticated on public.episodes is
  'Authenticated users can read shared TMDB episode metadata.';

-- User library: users can manage only their own show-library rows.
drop policy if exists user_shows_select_own on public.user_shows;
create policy user_shows_select_own on public.user_shows
for select to authenticated
using ((select auth.uid()) = user_id);
comment on policy user_shows_select_own on public.user_shows is
  'Authenticated users can read only their own library rows.';

drop policy if exists user_shows_insert_own on public.user_shows;
create policy user_shows_insert_own on public.user_shows
for insert to authenticated
with check ((select auth.uid()) = user_id);
comment on policy user_shows_insert_own on public.user_shows is
  'Authenticated users can add shows only to their own library.';

drop policy if exists user_shows_update_own on public.user_shows;
create policy user_shows_update_own on public.user_shows
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
comment on policy user_shows_update_own on public.user_shows is
  'Authenticated users can update only their own library rows.';

drop policy if exists user_shows_delete_own on public.user_shows;
create policy user_shows_delete_own on public.user_shows
for delete to authenticated
using ((select auth.uid()) = user_id);
comment on policy user_shows_delete_own on public.user_shows is
  'Authenticated users can remove shows only from their own library.';

-- Watched progress: users can manage only their own episode progress.
drop policy if exists watched_episodes_select_own on public.watched_episodes;
create policy watched_episodes_select_own on public.watched_episodes
for select to authenticated
using ((select auth.uid()) = user_id);
comment on policy watched_episodes_select_own on public.watched_episodes is
  'Authenticated users can read only their own watched episode progress.';

drop policy if exists watched_episodes_insert_own on public.watched_episodes;
create policy watched_episodes_insert_own on public.watched_episodes
for insert to authenticated
with check ((select auth.uid()) = user_id);
comment on policy watched_episodes_insert_own on public.watched_episodes is
  'Authenticated users can mark watched episodes only for their own account.';

drop policy if exists watched_episodes_update_own on public.watched_episodes;
create policy watched_episodes_update_own on public.watched_episodes
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
comment on policy watched_episodes_update_own on public.watched_episodes is
  'Authenticated users can update only their own watched episode rows.';

drop policy if exists watched_episodes_delete_own on public.watched_episodes;
create policy watched_episodes_delete_own on public.watched_episodes
for delete to authenticated
using ((select auth.uid()) = user_id);
comment on policy watched_episodes_delete_own on public.watched_episodes is
  'Authenticated users can unmark watched episodes only for their own account.';

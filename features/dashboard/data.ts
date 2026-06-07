import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";

import { DEFAULT_USER_PREFERENCES } from "../preferences/defaults";
import type { UserPreferences } from "../preferences/types";
import { setEpisodeWatched } from "../shows/data";
import type { Episode, WatchedEpisode } from "../tracking";
import type { DashboardShowRecord } from "./types";
import { createDashboardData, getContinueWatchingNextEpisode } from "./view-model";

type EpisodicSupabaseClient = SupabaseClient<Database>;
type EpisodeRow = Database["public"]["Tables"]["episodes"]["Row"];
type ShowRow = Database["public"]["Tables"]["shows"]["Row"];
type UserShowRow = Database["public"]["Tables"]["user_shows"]["Row"];
type WatchedEpisodeRow = Database["public"]["Tables"]["watched_episodes"]["Row"];

export class DashboardDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DashboardDataError";
  }
}

function throwDataError(error: { message?: string } | null, fallbackMessage: string) {
  if (error) {
    throw new DashboardDataError(fallbackMessage);
  }
}

function groupByShowTmdbId<TRow extends { show_tmdb_id: number }>(rows: TRow[]) {
  return rows.reduce((groups, row) => {
    const currentRows = groups.get(row.show_tmdb_id) ?? [];
    currentRows.push(row);
    groups.set(row.show_tmdb_id, currentRows);
    return groups;
  }, new Map<number, TRow[]>());
}

function mapEpisode(row: EpisodeRow): Episode {
  return {
    airDate: row.air_date,
    episodeNumber: row.episode_number,
    metadata: {},
    overview: row.overview,
    runtimeMinutes: row.runtime_minutes,
    seasonNumber: row.season_number,
    showTmdbId: row.show_tmdb_id,
    stillPath: row.still_path,
    title: row.title,
    tmdbId: row.tmdb_id,
  };
}

function mapWatchedEpisode(row: WatchedEpisodeRow): WatchedEpisode {
  return {
    episodeNumber: row.episode_number,
    id: row.id,
    seasonNumber: row.season_number,
    showTmdbId: row.show_tmdb_id,
    userId: row.user_id,
    watchedAt: row.watched_at,
  };
}

function createDashboardRecord(
  userShow: UserShowRow,
  show: ShowRow | undefined,
  episodeRows: EpisodeRow[],
  watchedEpisodeRows: WatchedEpisodeRow[],
): DashboardShowRecord {
  return {
    addedAt: userShow.added_at,
    episodes: episodeRows.map(mapEpisode),
    favourite: userShow.favourite,
    posterPath: show?.poster_path ?? null,
    title: show?.title ?? `Show ${userShow.show_tmdb_id}`,
    tmdbId: userShow.show_tmdb_id,
    tmdbStatus: show?.tmdb_status ?? null,
    trackingStatus: userShow.status,
    watchedEpisodes: watchedEpisodeRows.map(mapWatchedEpisode),
  };
}

export async function getUserDashboardData(
  supabase: EpisodicSupabaseClient,
  userId: string,
  preferences: UserPreferences = DEFAULT_USER_PREFERENCES,
) {
  const { data: userShows, error: userShowsError } = await supabase
    .from("user_shows")
    .select("*")
    .eq("user_id", userId)
    .order("added_at", { ascending: false });

  throwDataError(userShowsError, "Unable to load your dashboard.");

  if (!userShows || userShows.length === 0) {
    return createDashboardData([], preferences);
  }

  const showIds = userShows.map((show) => show.show_tmdb_id);

  const [
    { data: shows, error: showsError },
    { data: episodes, error: episodesError },
    { data: watchedEpisodes, error: watchedEpisodesError },
  ] = await Promise.all([
    supabase.from("shows").select("*").in("tmdb_id", showIds),
    supabase
      .from("episodes")
      .select("*")
      .in("show_tmdb_id", showIds)
      .order("season_number", { ascending: true })
      .order("episode_number", { ascending: true }),
    supabase
      .from("watched_episodes")
      .select("*")
      .eq("user_id", userId)
      .in("show_tmdb_id", showIds),
  ]);

  throwDataError(showsError, "Unable to load show details.");
  throwDataError(episodesError, "Unable to load episodes.");
  throwDataError(watchedEpisodesError, "Unable to load watched progress.");

  const showsById = new Map((shows ?? []).map((show) => [show.tmdb_id, show]));
  const episodesByShowId = groupByShowTmdbId(episodes ?? []);
  const watchedByShowId = groupByShowTmdbId(watchedEpisodes ?? []);
  const records = userShows.map((userShow) =>
    createDashboardRecord(
      userShow,
      showsById.get(userShow.show_tmdb_id),
      episodesByShowId.get(userShow.show_tmdb_id) ?? [],
      watchedByShowId.get(userShow.show_tmdb_id) ?? [],
    ),
  );

  return createDashboardData(records, preferences);
}

export async function markContinueWatchingNextEpisodeWatched(
  supabase: EpisodicSupabaseClient,
  userId: string,
  tmdbId: number,
  seasonNumber: number,
  episodeNumber: number,
) {
  const [
    { data: userShows, error: userShowsError },
    { data: shows, error: showsError },
    { data: episodes, error: episodesError },
    { data: watchedEpisodes, error: watchedEpisodesError },
  ] = await Promise.all([
    supabase
      .from("user_shows")
      .select("*")
      .eq("user_id", userId)
      .eq("show_tmdb_id", tmdbId)
      .limit(1),
    supabase.from("shows").select("*").eq("tmdb_id", tmdbId).limit(1),
    supabase
      .from("episodes")
      .select("*")
      .eq("show_tmdb_id", tmdbId)
      .order("season_number", { ascending: true })
      .order("episode_number", { ascending: true }),
    supabase
      .from("watched_episodes")
      .select("*")
      .eq("user_id", userId)
      .eq("show_tmdb_id", tmdbId),
  ]);

  throwDataError(userShowsError, "Unable to load this show from your library.");
  throwDataError(showsError, "Unable to load show details.");
  throwDataError(episodesError, "Unable to load episodes.");
  throwDataError(watchedEpisodesError, "Unable to load watched progress.");

  const userShow = userShows?.[0];

  if (!userShow) {
    throw new DashboardDataError("This show is not in your library.");
  }

  const record = createDashboardRecord(userShow, shows?.[0], episodes ?? [], watchedEpisodes ?? []);
  const nextEpisode = getContinueWatchingNextEpisode(record);

  if (!nextEpisode) {
    throw new DashboardDataError("No main-series episode is currently available to continue.");
  }

  if (nextEpisode.seasonNumber !== seasonNumber || nextEpisode.episodeNumber !== episodeNumber) {
    throw new DashboardDataError("The next episode has changed. Refresh and try again.");
  }

  await setEpisodeWatched(supabase, userId, tmdbId, seasonNumber, episodeNumber, true);
}

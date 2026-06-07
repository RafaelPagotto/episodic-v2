import type { SupabaseClient } from "@supabase/supabase-js";

import {
  calculateProgressPercentage,
  calculateTotalEpisodeCount,
  calculateWatchedEpisodeCount,
  deriveDisplayStatus,
  deriveTrackingStatusAfterProgressChange,
} from "@/features/tracking";
import type { Episode, WatchedEpisode } from "@/features/tracking";
import type { Database } from "@/lib/supabase/types";

import type { LibraryShowCard } from "./types";

type EpisodicSupabaseClient = SupabaseClient<Database>;
type EpisodeRow = Database["public"]["Tables"]["episodes"]["Row"];
type ShowRow = Database["public"]["Tables"]["shows"]["Row"];
type UserShowRow = Database["public"]["Tables"]["user_shows"]["Row"];
type UserShowUpdate = Database["public"]["Tables"]["user_shows"]["Update"];
type WatchedEpisodeRow = Database["public"]["Tables"]["watched_episodes"]["Row"];

export class LibraryDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LibraryDataError";
  }
}

function throwDataError(error: { message?: string } | null, fallbackMessage: string) {
  if (error) {
    throw new LibraryDataError(fallbackMessage);
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

function createLibraryCard(
  userShow: UserShowRow,
  show: ShowRow | undefined,
  episodes: EpisodeRow[],
  watchedEpisodes: WatchedEpisodeRow[],
): LibraryShowCard {
  const mappedEpisodes = episodes.map(mapEpisode);
  const mappedWatchedEpisodes = watchedEpisodes.map(mapWatchedEpisode);
  const totalEpisodeCount = calculateTotalEpisodeCount(mappedEpisodes);
  const watchedEpisodeCount = calculateWatchedEpisodeCount(mappedEpisodes, mappedWatchedEpisodes);
  const progressPercentage = calculateProgressPercentage({
    totalEpisodeCount,
    watchedEpisodeCount,
  });
  const displayStatus = deriveDisplayStatus({
    tmdbStatus: show?.tmdb_status ?? null,
    totalEpisodeCount,
    trackingStatus: userShow.status,
    watchedEpisodeCount,
  });

  return {
    addedAt: userShow.added_at,
    displayStatus,
    favourite: userShow.favourite,
    firstAirDate: show?.first_air_date ?? null,
    posterPath: show?.poster_path ?? null,
    progressPercentage,
    status: userShow.status,
    title: show?.title ?? `Show ${userShow.show_tmdb_id}`,
    tmdbId: userShow.show_tmdb_id,
    tmdbStatus: show?.tmdb_status ?? null,
    totalEpisodeCount,
    watchedEpisodeCount,
  };
}

export async function getUserLibraryShows(supabase: EpisodicSupabaseClient, userId: string) {
  const { data: userShows, error: userShowsError } = await supabase
    .from("user_shows")
    .select("*")
    .eq("user_id", userId)
    .order("added_at", { ascending: false });

  throwDataError(userShowsError, "Unable to load your library.");

  if (!userShows || userShows.length === 0) {
    return [];
  }

  const showIds = userShows.map((show) => show.show_tmdb_id);

  const [
    { data: shows, error: showsError },
    { data: episodes, error: episodesError },
    { data: watchedEpisodes, error: watchedEpisodesError },
  ] = await Promise.all([
    supabase.from("shows").select("*").in("tmdb_id", showIds),
    supabase.from("episodes").select("*").in("show_tmdb_id", showIds),
    supabase.from("watched_episodes").select("*").eq("user_id", userId).in("show_tmdb_id", showIds),
  ]);

  throwDataError(showsError, "Unable to load show details.");
  throwDataError(episodesError, "Unable to load episode details.");
  throwDataError(watchedEpisodesError, "Unable to load watched progress.");

  const showsById = new Map((shows ?? []).map((show) => [show.tmdb_id, show]));
  const episodesByShowId = groupByShowTmdbId(episodes ?? []);
  const watchedByShowId = groupByShowTmdbId(watchedEpisodes ?? []);

  return userShows.map((userShow) =>
    createLibraryCard(
      userShow,
      showsById.get(userShow.show_tmdb_id),
      episodesByShowId.get(userShow.show_tmdb_id) ?? [],
      watchedByShowId.get(userShow.show_tmdb_id) ?? [],
    ),
  );
}

export async function removeShowFromUserLibrary(
  supabase: EpisodicSupabaseClient,
  userId: string,
  tmdbId: number,
) {
  // watched_episodes cascade from watched_episodes_library_fk when the library row is deleted.
  const { error: libraryDeleteError } = await supabase
    .from("user_shows")
    .delete()
    .eq("user_id", userId)
    .eq("show_tmdb_id", tmdbId);

  throwDataError(libraryDeleteError, "Unable to remove this show.");
}

async function updateOwnedUserShow(
  supabase: EpisodicSupabaseClient,
  userId: string,
  tmdbId: number,
  values: UserShowUpdate,
) {
  const { data, error } = await supabase
    .from("user_shows")
    .update(values)
    .eq("user_id", userId)
    .eq("show_tmdb_id", tmdbId)
    .select("show_tmdb_id")
    .limit(1);

  throwDataError(error, "Unable to update this show.");

  if (!data?.[0]) {
    throw new LibraryDataError("This show is not in your library.");
  }
}

export async function updateUserShowFavourite(
  supabase: EpisodicSupabaseClient,
  userId: string,
  tmdbId: number,
  favourite: boolean,
) {
  await updateOwnedUserShow(supabase, userId, tmdbId, { favourite });
}

async function getStoredStatusAfterResume(
  supabase: EpisodicSupabaseClient,
  userId: string,
  tmdbId: number,
): Promise<UserShowRow["status"]> {
  const [
    { data: episodeRows, error: episodesError },
    { data: watchedEpisodeRows, error: watchedEpisodesError },
  ] = await Promise.all([
    supabase.from("episodes").select("*").eq("show_tmdb_id", tmdbId),
    supabase.from("watched_episodes").select("*").eq("user_id", userId).eq("show_tmdb_id", tmdbId),
  ]);

  throwDataError(episodesError, "Unable to load episode details.");
  throwDataError(watchedEpisodesError, "Unable to load watched progress.");

  const episodes = (episodeRows ?? []).map(mapEpisode);
  const watchedEpisodes = (watchedEpisodeRows ?? []).map(mapWatchedEpisode);

  return deriveTrackingStatusAfterProgressChange({
    totalEpisodeCount: calculateTotalEpisodeCount(episodes),
    trackingStatus: "watchlist",
    watchedEpisodeCount: calculateWatchedEpisodeCount(episodes, watchedEpisodes),
  });
}

export async function updateUserShowDropped(
  supabase: EpisodicSupabaseClient,
  userId: string,
  tmdbId: number,
  dropped: boolean,
) {
  const status = dropped ? "dropped" : await getStoredStatusAfterResume(supabase, userId, tmdbId);

  await updateOwnedUserShow(supabase, userId, tmdbId, { status });

  return status;
}

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";

import {
  calculateProgressPercentage,
  calculateTotalEpisodeCount,
  calculateWatchedEpisodeCount,
  deriveDisplayStatus,
  deriveTrackingStatusAfterProgressChange,
  loadEpisodesByShowIds,
  loadWatchedEpisodesByShowIds,
  mapEpisodeRow,
  mapWatchedEpisodeRow,
} from "../tracking";
import type { Episode, EpisodeCalculationOptions, WatchedEpisode } from "../tracking";

import type { LibraryShowCard } from "./types";

type EpisodicSupabaseClient = SupabaseClient<Database>;
type ShowRow = Database["public"]["Tables"]["shows"]["Row"];
type UserShowRow = Database["public"]["Tables"]["user_shows"]["Row"];
type UserShowUpdate = Database["public"]["Tables"]["user_shows"]["Update"];

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

function createLibraryCard(
  userShow: UserShowRow,
  show: ShowRow | undefined,
  episodes: Episode[],
  watchedEpisodes: WatchedEpisode[],
  options: EpisodeCalculationOptions,
): LibraryShowCard {
  const totalEpisodeCount = calculateTotalEpisodeCount(episodes, options);
  const watchedEpisodeCount = calculateWatchedEpisodeCount(episodes, watchedEpisodes, options);
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

async function getLibraryEpisodesByShowId(supabase: EpisodicSupabaseClient, showIds: number[]) {
  try {
    return await loadEpisodesByShowIds(supabase, showIds);
  } catch {
    throw new LibraryDataError("Unable to load episode details.");
  }
}

async function getLibraryWatchedEpisodesByShowId(
  supabase: EpisodicSupabaseClient,
  userId: string,
  showIds: number[],
) {
  try {
    return await loadWatchedEpisodesByShowIds(supabase, userId, showIds);
  } catch {
    throw new LibraryDataError("Unable to load watched progress.");
  }
}

export async function getUserLibraryShows(
  supabase: EpisodicSupabaseClient,
  userId: string,
  options: EpisodeCalculationOptions = {},
) {
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
    episodesByShowId,
    watchedByShowId,
  ] = await Promise.all([
    supabase.from("shows").select("*").in("tmdb_id", showIds),
    getLibraryEpisodesByShowId(supabase, showIds),
    getLibraryWatchedEpisodesByShowId(supabase, userId, showIds),
  ]);

  throwDataError(showsError, "Unable to load show details.");

  const showsById = new Map((shows ?? []).map((show) => [show.tmdb_id, show]));

  return userShows.map((userShow) =>
    createLibraryCard(
      userShow,
      showsById.get(userShow.show_tmdb_id),
      episodesByShowId.get(userShow.show_tmdb_id) ?? [],
      watchedByShowId.get(userShow.show_tmdb_id) ?? [],
      options,
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
  options: EpisodeCalculationOptions,
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

  const episodes = (episodeRows ?? []).map(mapEpisodeRow);
  const watchedEpisodes = (watchedEpisodeRows ?? []).map(mapWatchedEpisodeRow);

  return deriveTrackingStatusAfterProgressChange({
    totalEpisodeCount: calculateTotalEpisodeCount(episodes, options),
    trackingStatus: "watchlist",
    watchedEpisodeCount: calculateWatchedEpisodeCount(episodes, watchedEpisodes, options),
  });
}

export async function updateUserShowDropped(
  supabase: EpisodicSupabaseClient,
  userId: string,
  tmdbId: number,
  dropped: boolean,
  options: EpisodeCalculationOptions = {},
) {
  const status = dropped ? "dropped" : await getStoredStatusAfterResume(supabase, userId, tmdbId, options);

  await updateOwnedUserShow(supabase, userId, tmdbId, { status });

  return status;
}

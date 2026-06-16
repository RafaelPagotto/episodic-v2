import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";

import type { Episode, TrackingStatus, WatchedEpisode } from "../tracking";
import {
  buildEpisodeKey,
  calculateProgressPercentage,
  calculateReleasedEpisodeCount,
  calculateReleasedWatchedEpisodeCount,
  calculateTotalEpisodeCount,
  calculateWatchedEpisodeCount,
  deriveDisplayStatus,
  deriveTrackingStatusAfterProgressChange,
  getReleasedEpisodes,
  getReleasedTrackableEpisodes,
  loadEpisodesByShowIds,
  loadWatchedEpisodesByShowIds,
  mapEpisodeRow,
} from "../tracking";

import type { ShowDetail, ShowDetailEpisode, ShowDetailSeason, ShowProgress } from "./types";

type EpisodicSupabaseClient = SupabaseClient<Database>;
type EpisodeRow = Database["public"]["Tables"]["episodes"]["Row"];
type SeasonRow = Database["public"]["Tables"]["seasons"]["Row"];
type ShowRow = Database["public"]["Tables"]["shows"]["Row"];
type UserShowRow = Database["public"]["Tables"]["user_shows"]["Row"];
type WatchedEpisodeInsert = Database["public"]["Tables"]["watched_episodes"]["Insert"];

export class ShowDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ShowDataError";
  }
}

function throwDataError(error: { message?: string } | null, fallbackMessage: string) {
  if (error) {
    throw new ShowDataError(fallbackMessage);
  }
}

function groupBySeasonNumber(episodes: Episode[]) {
  return episodes.reduce((groups, episode) => {
    const currentEpisodes = groups.get(episode.seasonNumber) ?? [];
    currentEpisodes.push(episode);
    groups.set(episode.seasonNumber, currentEpisodes);
    return groups;
  }, new Map<number, Episode[]>());
}

function getProgress(
  status: TrackingStatus,
  episodes: Episode[],
  watchedEpisodes: WatchedEpisode[],
  tmdbStatus?: string | null,
): ShowProgress {
  const totalEpisodeCount = calculateTotalEpisodeCount(episodes);
  const watchedEpisodeCount = calculateWatchedEpisodeCount(episodes, watchedEpisodes);

  return {
    displayStatus: deriveDisplayStatus({
      tmdbStatus,
      totalEpisodeCount,
      trackingStatus: status,
      watchedEpisodeCount,
    }),
    progressPercentage: calculateProgressPercentage({
      totalEpisodeCount,
      watchedEpisodeCount,
    }),
    status,
    totalEpisodeCount,
    watchedEpisodeCount,
  };
}

function getSeasonProgress(
  status: TrackingStatus,
  episodes: Episode[],
  watchedEpisodes: WatchedEpisode[],
  tmdbStatus?: string | null,
): ShowProgress {
  const totalEpisodeCount = calculateReleasedEpisodeCount(episodes);
  const watchedEpisodeCount = calculateReleasedWatchedEpisodeCount(episodes, watchedEpisodes);

  return {
    displayStatus: deriveDisplayStatus({
      tmdbStatus,
      totalEpisodeCount,
      trackingStatus: status,
      watchedEpisodeCount,
    }),
    progressPercentage: calculateProgressPercentage({
      totalEpisodeCount,
      watchedEpisodeCount,
    }),
    status,
    totalEpisodeCount,
    watchedEpisodeCount,
  };
}

function createEpisodeDetail(episode: Episode, watchedEpisodeKeys: Set<string>): ShowDetailEpisode {
  return {
    airDate: episode.airDate,
    episodeNumber: episode.episodeNumber,
    overview: episode.overview,
    runtimeMinutes: episode.runtimeMinutes,
    seasonNumber: episode.seasonNumber,
    stillPath: episode.stillPath,
    title: episode.title,
    watched: watchedEpisodeKeys.has(buildEpisodeKey(episode)),
  };
}

function createSeasonDetail(
  season: SeasonRow | undefined,
  seasonNumber: number,
  status: TrackingStatus,
  episodes: Episode[],
  watchedEpisodes: WatchedEpisode[],
  watchedEpisodeKeys: Set<string>,
  tmdbStatus?: string | null,
): ShowDetailSeason {
  return {
    airDate: season?.air_date ?? null,
    episodeCount: episodes.length || season?.episode_count || 0,
    episodes: episodes.map((episode) => createEpisodeDetail(episode, watchedEpisodeKeys)),
    name: season?.name ?? `Season ${seasonNumber}`,
    overview: season?.overview ?? null,
    posterPath: season?.poster_path ?? null,
    progress: getSeasonProgress(status, episodes, watchedEpisodes, tmdbStatus),
    seasonNumber,
  };
}

function createShowDetail(
  userShow: UserShowRow,
  show: ShowRow | undefined,
  seasons: SeasonRow[],
  episodes: Episode[],
  watchedEpisodes: WatchedEpisode[],
): ShowDetail {
  const episodesBySeason = groupBySeasonNumber(episodes);
  const seasonsByNumber = new Map(seasons.map((season) => [season.season_number, season]));
  const watchedEpisodeKeys = new Set(watchedEpisodes.map(buildEpisodeKey));
  const seasonNumbers = Array.from(new Set([...seasonsByNumber.keys(), ...episodesBySeason.keys()])).sort(
    (left, right) => left - right,
  );

  return {
    backdropPath: show?.backdrop_path ?? null,
    favourite: userShow.favourite,
    firstAirDate: show?.first_air_date ?? null,
    lastSyncedAt: show?.last_synced_at ?? null,
    overview: show?.overview ?? null,
    posterPath: show?.poster_path ?? null,
    progress: getProgress(userShow.status, episodes, watchedEpisodes, show?.tmdb_status ?? null),
    seasons: seasonNumbers.map((seasonNumber) => {
      const seasonEpisodes = episodesBySeason.get(seasonNumber) ?? [];
      const seasonWatchedEpisodes = watchedEpisodes.filter((episode) => episode.seasonNumber === seasonNumber);

      return createSeasonDetail(
        seasonsByNumber.get(seasonNumber),
        seasonNumber,
        userShow.status,
        seasonEpisodes,
        seasonWatchedEpisodes,
        watchedEpisodeKeys,
        show?.tmdb_status ?? null,
      );
    }),
    title: show?.title ?? `Show ${userShow.show_tmdb_id}`,
    tmdbId: userShow.show_tmdb_id,
    tmdbStatus: show?.tmdb_status ?? null,
  };
}

export async function getOwnedUserShow(
  supabase: EpisodicSupabaseClient,
  userId: string,
  tmdbId: number,
) {
  const { data, error } = await supabase
    .from("user_shows")
    .select("*")
    .eq("user_id", userId)
    .eq("show_tmdb_id", tmdbId)
    .limit(1);

  throwDataError(error, "Unable to load show from your library.");

  return data?.[0] ?? null;
}

async function getShowEpisodes(supabase: EpisodicSupabaseClient, tmdbId: number, seasonNumber?: number) {
  let query = supabase
    .from("episodes")
    .select("*")
    .eq("show_tmdb_id", tmdbId)
    .order("season_number", { ascending: true })
    .order("episode_number", { ascending: true });

  if (seasonNumber !== undefined) {
    query = query.eq("season_number", seasonNumber);
  }

  const { data, error } = await query;

  throwDataError(error, "Unable to load episodes.");

  return data ?? [];
}

async function getFullShowEpisodes(supabase: EpisodicSupabaseClient, tmdbId: number) {
  try {
    const episodesByShowId = await loadEpisodesByShowIds(supabase, [tmdbId]);

    return episodesByShowId.get(tmdbId) ?? [];
  } catch {
    throw new ShowDataError("Unable to load episodes.");
  }
}

async function getFullShowWatchedEpisodes(supabase: EpisodicSupabaseClient, userId: string, tmdbId: number) {
  try {
    const watchedByShowId = await loadWatchedEpisodesByShowIds(supabase, userId, [tmdbId]);

    return watchedByShowId.get(tmdbId) ?? [];
  } catch {
    throw new ShowDataError("Unable to load watched progress.");
  }
}

async function updateUserShowStatusFromProgress(
  supabase: EpisodicSupabaseClient,
  userShow: UserShowRow,
  watchedEpisodes?: WatchedEpisode[],
) {
  const episodes = await getFullShowEpisodes(supabase, userShow.show_tmdb_id);
  const currentWatchedEpisodes =
    watchedEpisodes ?? (await getFullShowWatchedEpisodes(supabase, userShow.user_id, userShow.show_tmdb_id));
  const nextStatus = deriveTrackingStatusAfterProgressChange({
    totalEpisodeCount: calculateTotalEpisodeCount(episodes),
    trackingStatus: userShow.status,
    watchedEpisodeCount: calculateWatchedEpisodeCount(episodes, currentWatchedEpisodes),
  });

  if (nextStatus === userShow.status) {
    return;
  }

  const { error } = await supabase
    .from("user_shows")
    .update({ status: nextStatus })
    .eq("user_id", userShow.user_id)
    .eq("show_tmdb_id", userShow.show_tmdb_id);

  throwDataError(error, "Unable to update show status.");
}

function watchedEpisodeInsertFromEpisode(row: EpisodeRow, userId: string): WatchedEpisodeInsert {
  return {
    episode_number: row.episode_number,
    season_number: row.season_number,
    show_tmdb_id: row.show_tmdb_id,
    user_id: userId,
  };
}

function watchedEpisodeInsertFromTrackedEpisode(episode: Episode, userId: string): WatchedEpisodeInsert {
  return {
    episode_number: episode.episodeNumber,
    season_number: episode.seasonNumber,
    show_tmdb_id: episode.showTmdbId,
    user_id: userId,
  };
}

function getReleasedEpisodeRows(episodes: EpisodeRow[]) {
  const trackableKeys = new Set(getReleasedEpisodes(episodes.map(mapEpisodeRow)).map(buildEpisodeKey));

  return episodes.filter((episode) => trackableKeys.has(buildEpisodeKey(mapEpisodeRow(episode))));
}

export async function getUserShowDetail(
  supabase: EpisodicSupabaseClient,
  userId: string,
  tmdbId: number,
) {
  const userShow = await getOwnedUserShow(supabase, userId, tmdbId);

  if (!userShow) {
    return null;
  }

  const [
    { data: shows, error: showError },
    { data: seasons, error: seasonsError },
    episodes,
    watchedEpisodes,
  ] = await Promise.all([
    supabase.from("shows").select("*").eq("tmdb_id", tmdbId).limit(1),
    supabase.from("seasons").select("*").eq("show_tmdb_id", tmdbId).order("season_number", { ascending: true }),
    getFullShowEpisodes(supabase, tmdbId),
    getFullShowWatchedEpisodes(supabase, userId, tmdbId),
  ]);

  throwDataError(showError, "Unable to load show details.");
  throwDataError(seasonsError, "Unable to load seasons.");

  return createShowDetail(userShow, shows?.[0], seasons ?? [], episodes, watchedEpisodes);
}

export async function setEpisodeWatched(
  supabase: EpisodicSupabaseClient,
  userId: string,
  tmdbId: number,
  seasonNumber: number,
  episodeNumber: number,
  watched: boolean,
) {
  const userShow = await getOwnedUserShow(supabase, userId, tmdbId);

  if (!userShow) {
    throw new ShowDataError("This show is not in your library.");
  }

  const { data: episodeRows, error: episodeError } = await supabase
    .from("episodes")
    .select("*")
    .eq("show_tmdb_id", tmdbId)
    .eq("season_number", seasonNumber)
    .eq("episode_number", episodeNumber)
    .limit(1);

  throwDataError(episodeError, "Unable to load episode.");

  const episode = episodeRows?.[0];

  if (!episode) {
    throw new ShowDataError("Episode not found.");
  }

  if (watched) {
    const { error } = await supabase
      .from("watched_episodes")
      .upsert(watchedEpisodeInsertFromEpisode(episode, userId), {
        onConflict: "user_id,show_tmdb_id,season_number,episode_number",
      });

    throwDataError(error, "Unable to mark episode watched.");
  } else {
    const { error } = await supabase
      .from("watched_episodes")
      .delete()
      .eq("user_id", userId)
      .eq("show_tmdb_id", tmdbId)
      .eq("season_number", seasonNumber)
      .eq("episode_number", episodeNumber);

    throwDataError(error, "Unable to mark episode unwatched.");
  }

  await updateUserShowStatusFromProgress(supabase, userShow);
}

export async function setSeasonWatched(
  supabase: EpisodicSupabaseClient,
  userId: string,
  tmdbId: number,
  seasonNumber: number,
  watched: boolean,
) {
  const userShow = await getOwnedUserShow(supabase, userId, tmdbId);

  if (!userShow) {
    throw new ShowDataError("This show is not in your library.");
  }

  const episodes = await getShowEpisodes(supabase, tmdbId, seasonNumber);

  if (episodes.length === 0) {
    throw new ShowDataError("No episodes found for this season.");
  }

  if (watched) {
    const trackableEpisodes = getReleasedEpisodeRows(episodes);

    if (trackableEpisodes.length === 0) {
      throw new ShowDataError("No released episodes found for this season.");
    }

    const { error } = await supabase
      .from("watched_episodes")
      .upsert(trackableEpisodes.map((episode) => watchedEpisodeInsertFromEpisode(episode, userId)), {
        onConflict: "user_id,show_tmdb_id,season_number,episode_number",
      });

    throwDataError(error, "Unable to mark season watched.");
  } else {
    const { error } = await supabase
      .from("watched_episodes")
      .delete()
      .eq("user_id", userId)
      .eq("show_tmdb_id", tmdbId)
      .eq("season_number", seasonNumber);

    throwDataError(error, "Unable to mark season unwatched.");
  }

  await updateUserShowStatusFromProgress(supabase, userShow);
}

export async function markShowWatched(
  supabase: EpisodicSupabaseClient,
  userId: string,
  tmdbId: number,
) {
  const userShow = await getOwnedUserShow(supabase, userId, tmdbId);

  if (!userShow) {
    throw new ShowDataError("This show is not in your library.");
  }

  const episodes = await getFullShowEpisodes(supabase, tmdbId);

  if (episodes.length === 0) {
    throw new ShowDataError("No episodes found for this show.");
  }

  const trackableEpisodes = getReleasedTrackableEpisodes(episodes);

  if (trackableEpisodes.length === 0) {
    throw new ShowDataError("No released episodes found for this show.");
  }

  const { error } = await supabase
    .from("watched_episodes")
    .upsert(trackableEpisodes.map((episode) => watchedEpisodeInsertFromTrackedEpisode(episode, userId)), {
      onConflict: "user_id,show_tmdb_id,season_number,episode_number",
    });

  throwDataError(error, "Unable to mark show watched.");

  await updateUserShowStatusFromProgress(supabase, userShow);
}

export async function resetShowProgress(
  supabase: EpisodicSupabaseClient,
  userId: string,
  tmdbId: number,
) {
  const userShow = await getOwnedUserShow(supabase, userId, tmdbId);

  if (!userShow) {
    throw new ShowDataError("This show is not in your library.");
  }

  const { error } = await supabase
    .from("watched_episodes")
    .delete()
    .eq("user_id", userId)
    .eq("show_tmdb_id", tmdbId);

  throwDataError(error, "Unable to reset show progress.");

  await updateUserShowStatusFromProgress(supabase, userShow, []);
}

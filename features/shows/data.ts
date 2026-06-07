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
} from "../tracking";

import type { ShowDetail, ShowDetailEpisode, ShowDetailSeason, ShowProgress } from "./types";

type EpisodicSupabaseClient = SupabaseClient<Database>;
type EpisodeRow = Database["public"]["Tables"]["episodes"]["Row"];
type SeasonRow = Database["public"]["Tables"]["seasons"]["Row"];
type ShowRow = Database["public"]["Tables"]["shows"]["Row"];
type UserShowRow = Database["public"]["Tables"]["user_shows"]["Row"];
type WatchedEpisodeInsert = Database["public"]["Tables"]["watched_episodes"]["Insert"];
type WatchedEpisodeRow = Database["public"]["Tables"]["watched_episodes"]["Row"];

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

function groupBySeasonNumber(rows: EpisodeRow[]) {
  return rows.reduce((groups, row) => {
    const currentRows = groups.get(row.season_number) ?? [];
    currentRows.push(row);
    groups.set(row.season_number, currentRows);
    return groups;
  }, new Map<number, EpisodeRow[]>());
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

function getProgress(
  status: TrackingStatus,
  episodes: EpisodeRow[],
  watchedEpisodes: WatchedEpisodeRow[],
  tmdbStatus?: string | null,
): ShowProgress {
  const mappedEpisodes = episodes.map(mapEpisode);
  const mappedWatchedEpisodes = watchedEpisodes.map(mapWatchedEpisode);
  const totalEpisodeCount = calculateTotalEpisodeCount(mappedEpisodes);
  const watchedEpisodeCount = calculateWatchedEpisodeCount(mappedEpisodes, mappedWatchedEpisodes);

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
  episodes: EpisodeRow[],
  watchedEpisodes: WatchedEpisodeRow[],
  tmdbStatus?: string | null,
): ShowProgress {
  const mappedEpisodes = episodes.map(mapEpisode);
  const mappedWatchedEpisodes = watchedEpisodes.map(mapWatchedEpisode);
  const totalEpisodeCount = calculateReleasedEpisodeCount(mappedEpisodes);
  const watchedEpisodeCount = calculateReleasedWatchedEpisodeCount(mappedEpisodes, mappedWatchedEpisodes);

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

function createEpisodeDetail(row: EpisodeRow, watchedEpisodeKeys: Set<string>): ShowDetailEpisode {
  return {
    airDate: row.air_date,
    episodeNumber: row.episode_number,
    overview: row.overview,
    runtimeMinutes: row.runtime_minutes,
    seasonNumber: row.season_number,
    stillPath: row.still_path,
    title: row.title,
    watched: watchedEpisodeKeys.has(buildEpisodeKey(mapEpisode(row))),
  };
}

function createSeasonDetail(
  season: SeasonRow | undefined,
  seasonNumber: number,
  status: TrackingStatus,
  episodes: EpisodeRow[],
  watchedEpisodes: WatchedEpisodeRow[],
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
  episodes: EpisodeRow[],
  watchedEpisodes: WatchedEpisodeRow[],
): ShowDetail {
  const episodesBySeason = groupBySeasonNumber(episodes);
  const seasonsByNumber = new Map(seasons.map((season) => [season.season_number, season]));
  const watchedEpisodeKeys = new Set(
    watchedEpisodes.map((episode) =>
      buildEpisodeKey({
        episodeNumber: episode.episode_number,
        seasonNumber: episode.season_number,
        showTmdbId: episode.show_tmdb_id,
      }),
    ),
  );
  const seasonNumbers = Array.from(new Set([...seasonsByNumber.keys(), ...episodesBySeason.keys()])).sort(
    (left, right) => left - right,
  );

  return {
    backdropPath: show?.backdrop_path ?? null,
    favourite: userShow.favourite,
    firstAirDate: show?.first_air_date ?? null,
    overview: show?.overview ?? null,
    posterPath: show?.poster_path ?? null,
    progress: getProgress(userShow.status, episodes, watchedEpisodes, show?.tmdb_status ?? null),
    seasons: seasonNumbers.map((seasonNumber) => {
      const seasonEpisodes = episodesBySeason.get(seasonNumber) ?? [];
      const seasonWatchedEpisodes = watchedEpisodes.filter((episode) => episode.season_number === seasonNumber);

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

async function getOwnedUserShow(
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

async function getWatchedEpisodes(supabase: EpisodicSupabaseClient, userId: string, tmdbId: number) {
  const { data, error } = await supabase
    .from("watched_episodes")
    .select("*")
    .eq("user_id", userId)
    .eq("show_tmdb_id", tmdbId);

  throwDataError(error, "Unable to load watched progress.");

  return data ?? [];
}

async function updateUserShowStatusFromProgress(
  supabase: EpisodicSupabaseClient,
  userShow: UserShowRow,
  watchedEpisodes?: WatchedEpisodeRow[],
) {
  const episodes = await getShowEpisodes(supabase, userShow.show_tmdb_id);
  const currentWatchedEpisodes =
    watchedEpisodes ?? (await getWatchedEpisodes(supabase, userShow.user_id, userShow.show_tmdb_id));
  const mappedEpisodes = episodes.map(mapEpisode);
  const mappedWatchedEpisodes = currentWatchedEpisodes.map(mapWatchedEpisode);
  const nextStatus = deriveTrackingStatusAfterProgressChange({
    totalEpisodeCount: calculateTotalEpisodeCount(mappedEpisodes),
    trackingStatus: userShow.status,
    watchedEpisodeCount: calculateWatchedEpisodeCount(mappedEpisodes, mappedWatchedEpisodes),
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

function getReleasedEpisodeRows(episodes: EpisodeRow[]) {
  const trackableKeys = new Set(getReleasedEpisodes(episodes.map(mapEpisode)).map(buildEpisodeKey));

  return episodes.filter((episode) => trackableKeys.has(buildEpisodeKey(mapEpisode(episode))));
}

function getReleasedTrackableEpisodeRows(episodes: EpisodeRow[]) {
  const trackableKeys = new Set(getReleasedTrackableEpisodes(episodes.map(mapEpisode)).map(buildEpisodeKey));

  return episodes.filter((episode) => trackableKeys.has(buildEpisodeKey(mapEpisode(episode))));
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
    { data: episodes, error: episodesError },
    { data: watchedEpisodes, error: watchedEpisodesError },
  ] = await Promise.all([
    supabase.from("shows").select("*").eq("tmdb_id", tmdbId).limit(1),
    supabase.from("seasons").select("*").eq("show_tmdb_id", tmdbId).order("season_number", { ascending: true }),
    supabase
      .from("episodes")
      .select("*")
      .eq("show_tmdb_id", tmdbId)
      .order("season_number", { ascending: true })
      .order("episode_number", { ascending: true }),
    supabase.from("watched_episodes").select("*").eq("user_id", userId).eq("show_tmdb_id", tmdbId),
  ]);

  throwDataError(showError, "Unable to load show details.");
  throwDataError(seasonsError, "Unable to load seasons.");
  throwDataError(episodesError, "Unable to load episodes.");
  throwDataError(watchedEpisodesError, "Unable to load watched progress.");

  return createShowDetail(userShow, shows?.[0], seasons ?? [], episodes ?? [], watchedEpisodes ?? []);
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

  const episodes = await getShowEpisodes(supabase, tmdbId);

  if (episodes.length === 0) {
    throw new ShowDataError("No episodes found for this show.");
  }

  const trackableEpisodes = getReleasedTrackableEpisodeRows(episodes);

  if (trackableEpisodes.length === 0) {
    throw new ShowDataError("No released episodes found for this show.");
  }

  const { error } = await supabase
    .from("watched_episodes")
    .upsert(trackableEpisodes.map((episode) => watchedEpisodeInsertFromEpisode(episode, userId)), {
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

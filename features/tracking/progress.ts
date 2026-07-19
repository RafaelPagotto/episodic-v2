import type { DisplayStatus, Episode, TrackingStatus, WatchedEpisode } from "./types";
import { compareDateOnly, getReferenceDateOnly, isDateOnly } from "../../lib/date-only";

type EpisodeIdentity = Pick<Episode, "episodeNumber" | "seasonNumber" | "showTmdbId">;

type DisplayStatusInput = {
  tmdbStatus?: string | null;
  trackingStatus: TrackingStatus;
  totalEpisodeCount: number;
  watchedEpisodeCount: number;
};

export type EpisodeCalculationOptions = {
  referenceDate?: Date | string;
  timeZone?: string | null;
};

type ProgressInput = {
  totalEpisodeCount: number;
  watchedEpisodeCount: number;
};

type TrackingStatusAfterProgressInput = {
  trackingStatus: TrackingStatus;
  totalEpisodeCount: number;
  watchedEpisodeCount: number;
};

const ENDED_LIFECYCLE_STATUSES = new Set(["canceled", "cancelled", "ended", "finished"]);

export function buildEpisodeKey({ episodeNumber, seasonNumber, showTmdbId }: EpisodeIdentity) {
  return `${showTmdbId}:${seasonNumber}:${episodeNumber}`;
}

export function isMainSeriesEpisode(episode: Pick<Episode, "seasonNumber">) {
  return episode.seasonNumber > 0;
}

export function isSpecialEpisode(episode: Pick<Episode, "seasonNumber">) {
  return episode.seasonNumber === 0;
}

function uniqueEpisodes(episodes: Episode[]) {
  const seenEpisodeKeys = new Set<string>();

  return episodes.filter((episode) => {
    const episodeKey = buildEpisodeKey(episode);

    if (seenEpisodeKeys.has(episodeKey)) {
      return false;
    }

    seenEpisodeKeys.add(episodeKey);
    return true;
  });
}

function watchedEpisodeKeySet(watchedEpisodes: WatchedEpisode[]) {
  return new Set(watchedEpisodes.map((episode) => buildEpisodeKey(episode)));
}

export function isEpisodeTrackable(episode: Episode, options: EpisodeCalculationOptions = {}) {
  // Unknown or invalid TMDB dates preserve the existing behavior and remain trackable.
  if (!isDateOnly(episode.airDate)) {
    return true;
  }

  const referenceDate = getReferenceDateOnly(options.referenceDate, options.timeZone);
  return compareDateOnly(episode.airDate, referenceDate) <= 0;
}

export function getReleasedEpisodes(episodes: Episode[], options: EpisodeCalculationOptions = {}) {
  return uniqueEpisodes(episodes).filter((episode) => isEpisodeTrackable(episode, options));
}

export function getReleasedTrackableEpisodes(episodes: Episode[], options: EpisodeCalculationOptions = {}) {
  return getReleasedEpisodes(episodes, options).filter(isMainSeriesEpisode);
}

export function getReleasedSpecialEpisodes(episodes: Episode[], options: EpisodeCalculationOptions = {}) {
  return getReleasedEpisodes(episodes, options).filter(isSpecialEpisode);
}

export function getTrackableEpisodes(episodes: Episode[], options: EpisodeCalculationOptions = {}) {
  return getReleasedTrackableEpisodes(episodes, options);
}

export function calculateTotalEpisodeCount(episodes: Episode[], options: EpisodeCalculationOptions = {}) {
  return getReleasedTrackableEpisodes(episodes, options).length;
}

export function calculateWatchedEpisodeCount(
  episodes: Episode[],
  watchedEpisodes: WatchedEpisode[],
  options: EpisodeCalculationOptions = {},
) {
  const episodeKeys = new Set(
    getReleasedTrackableEpisodes(episodes, options).map((episode) => buildEpisodeKey(episode)),
  );
  const watchedKeys = watchedEpisodeKeySet(watchedEpisodes);

  return Array.from(watchedKeys).filter((episodeKey) => episodeKeys.has(episodeKey)).length;
}

export function calculateReleasedEpisodeCount(episodes: Episode[], options: EpisodeCalculationOptions = {}) {
  return getReleasedEpisodes(episodes, options).length;
}

export function calculateReleasedWatchedEpisodeCount(
  episodes: Episode[],
  watchedEpisodes: WatchedEpisode[],
  options: EpisodeCalculationOptions = {},
) {
  const episodeKeys = new Set(getReleasedEpisodes(episodes, options).map((episode) => buildEpisodeKey(episode)));
  const watchedKeys = watchedEpisodeKeySet(watchedEpisodes);

  return Array.from(watchedKeys).filter((episodeKey) => episodeKeys.has(episodeKey)).length;
}

export function calculateProgressPercentage({
  totalEpisodeCount,
  watchedEpisodeCount,
}: ProgressInput) {
  if (totalEpisodeCount <= 0 || watchedEpisodeCount <= 0) {
    return 0;
  }

  return Math.min(100, Math.round((watchedEpisodeCount / totalEpisodeCount) * 100));
}

export function getNextEpisodeToWatch(
  episodes: Episode[],
  watchedEpisodes: WatchedEpisode[],
  options: EpisodeCalculationOptions = {},
) {
  const watchedKeys = watchedEpisodeKeySet(watchedEpisodes);

  return getReleasedTrackableEpisodes(episodes, options)
    .sort((left, right) => {
      if (left.showTmdbId !== right.showTmdbId) return left.showTmdbId - right.showTmdbId;
      if (left.seasonNumber !== right.seasonNumber) return left.seasonNumber - right.seasonNumber;
      return left.episodeNumber - right.episodeNumber;
    })
    .find((episode) => !watchedKeys.has(buildEpisodeKey(episode))) ?? null;
}

export function isShowCompleted(
  episodes: Episode[],
  watchedEpisodes: WatchedEpisode[],
  options: EpisodeCalculationOptions = {},
) {
  const totalEpisodeCount = calculateTotalEpisodeCount(episodes, options);

  if (totalEpisodeCount === 0) {
    return false;
  }

  return calculateWatchedEpisodeCount(episodes, watchedEpisodes, options) >= totalEpisodeCount;
}

export function isEndedShowLifecycleStatus(tmdbStatus: string | null | undefined) {
  if (!tmdbStatus) {
    return false;
  }

  return ENDED_LIFECYCLE_STATUSES.has(tmdbStatus.trim().toLowerCase());
}

export function deriveDisplayStatus({
  tmdbStatus,
  trackingStatus,
  totalEpisodeCount,
  watchedEpisodeCount,
}: DisplayStatusInput): DisplayStatus {
  if (trackingStatus === "dropped") {
    return "dropped";
  }

  if (totalEpisodeCount <= 0 || watchedEpisodeCount <= 0) {
    return "watchlist";
  }

  if (watchedEpisodeCount < totalEpisodeCount) {
    return "watching";
  }

  return isEndedShowLifecycleStatus(tmdbStatus) ? "completed" : "caught_up";
}

export function deriveTrackingStatusAfterProgressChange({
  trackingStatus,
  totalEpisodeCount,
  watchedEpisodeCount,
}: TrackingStatusAfterProgressInput): TrackingStatus {
  if (trackingStatus === "dropped") {
    return trackingStatus;
  }

  if (totalEpisodeCount > 0 && watchedEpisodeCount >= totalEpisodeCount) {
    return "watched";
  }

  if (watchedEpisodeCount > 0) {
    return "watching";
  }

  return "watchlist";
}

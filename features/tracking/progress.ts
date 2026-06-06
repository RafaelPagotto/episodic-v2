import type { DisplayStatus, Episode, TrackingStatus, WatchedEpisode } from "./types";

type EpisodeIdentity = Pick<Episode, "episodeNumber" | "seasonNumber" | "showTmdbId">;

type DisplayStatusInput = {
  tmdbStatus?: string | null;
  trackingStatus: TrackingStatus;
  totalEpisodeCount: number;
  watchedEpisodeCount: number;
};

type EpisodeCalculationOptions = {
  referenceDate?: Date | string;
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

function getReferenceDateValue(referenceDate: EpisodeCalculationOptions["referenceDate"] = new Date()) {
  const date = typeof referenceDate === "string" ? new Date(referenceDate) : referenceDate;

  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function getAirDateValue(airDate: string | null) {
  if (!airDate) {
    return null;
  }

  const parsedDate = new Date(`${airDate}T00:00:00.000Z`);
  const timestamp = parsedDate.getTime();

  return Number.isNaN(timestamp) ? null : timestamp;
}

export function isEpisodeTrackable(episode: Episode, options: EpisodeCalculationOptions = {}) {
  const airDateValue = getAirDateValue(episode.airDate);

  if (airDateValue === null) {
    return true;
  }

  return airDateValue <= getReferenceDateValue(options.referenceDate);
}

export function getTrackableEpisodes(episodes: Episode[], options: EpisodeCalculationOptions = {}) {
  return uniqueEpisodes(episodes).filter((episode) => isEpisodeTrackable(episode, options));
}

export function calculateTotalEpisodeCount(episodes: Episode[], options: EpisodeCalculationOptions = {}) {
  return getTrackableEpisodes(episodes, options).length;
}

export function calculateWatchedEpisodeCount(
  episodes: Episode[],
  watchedEpisodes: WatchedEpisode[],
  options: EpisodeCalculationOptions = {},
) {
  const episodeKeys = new Set(getTrackableEpisodes(episodes, options).map((episode) => buildEpisodeKey(episode)));
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

  return getTrackableEpisodes(episodes, options)
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

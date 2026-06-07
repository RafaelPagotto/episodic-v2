import {
  buildEpisodeKey,
  calculateProgressPercentage,
  calculateTotalEpisodeCount,
  calculateWatchedEpisodeCount,
  deriveDisplayStatus,
  getNextEpisodeToWatch,
  isMainSeriesEpisode,
} from "../tracking";
import { DEFAULT_USER_PREFERENCES } from "../preferences/defaults";
import type { UserPreferences } from "../preferences/types";
import {
  shouldFadeShowForPreferences,
  shouldHideShowForPreferences,
} from "../preferences/view-model";
import { getShowDetailSeasonHref } from "../shows/routes";

import type {
  ContinueWatchingItem,
  DashboardData,
  DashboardShowRecord,
  DashboardSummary,
  StartWatchingItem,
  UpcomingEpisodeItem,
} from "./types";

const START_WATCHING_LIMIT = 6;
const UPCOMING_EPISODE_LIMIT = 6;

type ContinueWatchingCandidate = Omit<ContinueWatchingItem, "isFaded">;

type DashboardDateOptions = {
  referenceDate?: Date | string;
};

function createEmptySummary(): DashboardSummary {
  return {
    caughtUpCount: 0,
    completedCount: 0,
    droppedCount: 0,
    favouriteCount: 0,
    totalShows: 0,
    watchingCount: 0,
    watchlistCount: 0,
  };
}

function getReferenceIsoDate(referenceDate: Date | string = new Date()) {
  if (typeof referenceDate === "string") {
    const datePart = referenceDate.match(/^(\d{4}-\d{2}-\d{2})/)?.[1];

    if (datePart) {
      return datePart;
    }

    const parsedDate = new Date(referenceDate);

    if (!Number.isNaN(parsedDate.getTime())) {
      return parsedDate.toISOString().slice(0, 10);
    }

    return new Date().toISOString().slice(0, 10);
  }

  if (Number.isNaN(referenceDate.getTime())) {
    return new Date().toISOString().slice(0, 10);
  }

  return referenceDate.toISOString().slice(0, 10);
}

function getUpcomingAirDate(airDate: string | null, referenceIsoDate: string) {
  if (!airDate || !/^\d{4}-\d{2}-\d{2}$/.test(airDate)) {
    return null;
  }

  return airDate > referenceIsoDate ? airDate : null;
}

function getLatestWatchedAt(record: DashboardShowRecord) {
  return record.watchedEpisodes.reduce<string | null>((latest, episode) => {
    if (!latest) {
      return episode.watchedAt;
    }

    return new Date(episode.watchedAt).getTime() > new Date(latest).getTime()
      ? episode.watchedAt
      : latest;
  }, null);
}

export function getDashboardShowProgress(record: DashboardShowRecord, options: DashboardDateOptions = {}) {
  const totalEpisodeCount = calculateTotalEpisodeCount(record.episodes, options);
  const watchedEpisodeCount = calculateWatchedEpisodeCount(record.episodes, record.watchedEpisodes, options);

  return {
    displayStatus: deriveDisplayStatus({
      tmdbStatus: record.tmdbStatus,
      totalEpisodeCount,
      trackingStatus: record.trackingStatus,
      watchedEpisodeCount,
    }),
    progressPercentage: calculateProgressPercentage({
      totalEpisodeCount,
      watchedEpisodeCount,
    }),
    totalEpisodeCount,
    watchedEpisodeCount,
  };
}

export function getContinueWatchingNextEpisode(record: DashboardShowRecord) {
  return getContinueWatchingState(record)?.nextEpisode ?? null;
}

function compareEpisodeOrder(left: { episodeNumber: number; seasonNumber: number }, right: { episodeNumber: number; seasonNumber: number }) {
  return left.seasonNumber - right.seasonNumber || left.episodeNumber - right.episodeNumber;
}

function getUpcomingEpisodeCandidate(
  record: DashboardShowRecord,
  referenceIsoDate: string,
  options: DashboardDateOptions,
): UpcomingEpisodeItem | null {
  const progress = getDashboardShowProgress(record, options);

  if (progress.displayStatus !== "watching" && progress.displayStatus !== "caught_up") {
    return null;
  }

  const watchedEpisodeKeys = new Set(record.watchedEpisodes.map((episode) => buildEpisodeKey(episode)));
  const nextUpcomingEpisode = record.episodes
    .map((episode) => ({
      airDate: getUpcomingAirDate(episode.airDate, referenceIsoDate),
      episode,
    }))
    .filter(
      (candidate): candidate is { airDate: string; episode: (typeof record.episodes)[number] } =>
        Boolean(candidate.airDate)
        && isMainSeriesEpisode(candidate.episode)
        && !watchedEpisodeKeys.has(buildEpisodeKey(candidate.episode)),
    )
    .sort((left, right) => {
      return (
        left.airDate.localeCompare(right.airDate)
        || left.episode.seasonNumber - right.episode.seasonNumber
        || left.episode.episodeNumber - right.episode.episodeNumber
      );
    })[0];

  if (!nextUpcomingEpisode) {
    return null;
  }

  return {
    airDate: nextUpcomingEpisode.airDate,
    detailHref: getShowDetailSeasonHref(record.tmdbId, nextUpcomingEpisode.episode.seasonNumber),
    episodeNumber: nextUpcomingEpisode.episode.episodeNumber,
    episodeTitle: nextUpcomingEpisode.episode.title,
    seasonNumber: nextUpcomingEpisode.episode.seasonNumber,
    showTitle: record.title,
    tmdbId: record.tmdbId,
  };
}

export function getUpcomingEpisodeItems(
  records: DashboardShowRecord[],
  options: DashboardDateOptions = {},
): UpcomingEpisodeItem[] {
  const referenceIsoDate = getReferenceIsoDate(options.referenceDate);

  return records
    .map((record) => getUpcomingEpisodeCandidate(record, referenceIsoDate, options))
    .filter((item): item is UpcomingEpisodeItem => Boolean(item))
    .sort((left, right) => {
      return (
        left.airDate.localeCompare(right.airDate)
        || left.showTitle.localeCompare(right.showTitle)
        || compareEpisodeOrder(left, right)
      );
    })
    .slice(0, UPCOMING_EPISODE_LIMIT);
}

function getAddedAtTime(addedAt: string) {
  const timestamp = new Date(addedAt).getTime();

  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function getStartWatchingCandidate(
  record: DashboardShowRecord,
  options: DashboardDateOptions,
): StartWatchingItem | null {
  const progress = getDashboardShowProgress(record, options);

  if (progress.displayStatus !== "watchlist" || progress.watchedEpisodeCount !== 0) {
    return null;
  }

  const firstEpisode = getNextEpisodeToWatch(record.episodes, record.watchedEpisodes, options);

  if (!firstEpisode) {
    return null;
  }

  return {
    detailHref: getShowDetailSeasonHref(record.tmdbId, firstEpisode.seasonNumber),
    episodeNumber: firstEpisode.episodeNumber,
    episodeTitle: firstEpisode.title,
    posterPath: record.posterPath,
    seasonNumber: firstEpisode.seasonNumber,
    showTitle: record.title,
    tmdbId: record.tmdbId,
  };
}

export function getStartWatchingItems(
  records: DashboardShowRecord[],
  options: DashboardDateOptions = {},
): StartWatchingItem[] {
  return records
    .map((record) => ({
      addedAt: record.addedAt,
      item: getStartWatchingCandidate(record, options),
    }))
    .filter((candidate): candidate is { addedAt: string; item: StartWatchingItem } => Boolean(candidate.item))
    .sort((left, right) => {
      return (
        getAddedAtTime(right.addedAt)
        - getAddedAtTime(left.addedAt)
        || left.item.showTitle.localeCompare(right.item.showTitle)
        || compareEpisodeOrder(left.item, right.item)
        || left.item.tmdbId - right.item.tmdbId
      );
    })
    .map((candidate) => candidate.item)
    .slice(0, START_WATCHING_LIMIT);
}

function getContinueWatchingState(record: DashboardShowRecord) {
  const progress = getDashboardShowProgress(record);
  const nextEpisode = getNextEpisodeToWatch(record.episodes, record.watchedEpisodes);

  if (
    !nextEpisode
    || progress.displayStatus !== "watching"
    || progress.watchedEpisodeCount === 0
    || progress.watchedEpisodeCount >= progress.totalEpisodeCount
  ) {
    return null;
  }

  return { nextEpisode, progress };
}

export function createDashboardSummary(records: DashboardShowRecord[]): DashboardSummary {
  return records.reduce<DashboardSummary>((summary, record) => {
    const progress = getDashboardShowProgress(record);

    return {
      caughtUpCount: summary.caughtUpCount + (progress.displayStatus === "caught_up" ? 1 : 0),
      completedCount: summary.completedCount + (progress.displayStatus === "completed" ? 1 : 0),
      droppedCount: summary.droppedCount + (progress.displayStatus === "dropped" ? 1 : 0),
      favouriteCount: summary.favouriteCount + (record.favourite ? 1 : 0),
      totalShows: summary.totalShows + 1,
      watchingCount: summary.watchingCount + (progress.displayStatus === "watching" ? 1 : 0),
      watchlistCount: summary.watchlistCount + (progress.displayStatus === "watchlist" ? 1 : 0),
    };
  }, createEmptySummary());
}

function getContinueWatchingCandidates(records: DashboardShowRecord[]): ContinueWatchingCandidate[] {
  return records
    .map((record) => {
      const continueWatchingState = getContinueWatchingState(record);

      if (!continueWatchingState) {
        return null;
      }

      const { nextEpisode, progress } = continueWatchingState;

      const candidate: ContinueWatchingCandidate = {
        displayStatus: progress.displayStatus,
        lastWatchedAt: getLatestWatchedAt(record),
        nextEpisode: {
          airDate: nextEpisode.airDate,
          episodeNumber: nextEpisode.episodeNumber,
          seasonNumber: nextEpisode.seasonNumber,
          title: nextEpisode.title,
        },
        posterPath: record.posterPath,
        progressPercentage: progress.progressPercentage,
        title: record.title,
        tmdbId: record.tmdbId,
        totalEpisodeCount: progress.totalEpisodeCount,
        watchedEpisodeCount: progress.watchedEpisodeCount,
      };

      return candidate;
    })
    .filter((item): item is ContinueWatchingCandidate => Boolean(item));
}

function applyContinueWatchingPreferences(
  candidates: ContinueWatchingCandidate[],
  preferences: UserPreferences,
) {
  // Added-show preferences target TMDB search results; dashboard candidates are already in the library.
  return candidates
    .filter((item) => !shouldHideShowForPreferences(item, preferences))
    .map((item) => ({
      ...item,
      isFaded: shouldFadeShowForPreferences(item, preferences),
    }))
    .sort((left, right) => {
      const leftTime = left.lastWatchedAt ? new Date(left.lastWatchedAt).getTime() : 0;
      const rightTime = right.lastWatchedAt ? new Date(right.lastWatchedAt).getTime() : 0;

      return rightTime - leftTime || left.title.localeCompare(right.title);
    });
}

export function getContinueWatchingItems(
  records: DashboardShowRecord[],
  preferences: UserPreferences = DEFAULT_USER_PREFERENCES,
): ContinueWatchingItem[] {
  return applyContinueWatchingPreferences(getContinueWatchingCandidates(records), preferences);
}

export function createDashboardData(
  records: DashboardShowRecord[],
  preferences: UserPreferences = DEFAULT_USER_PREFERENCES,
): DashboardData {
  const candidates = getContinueWatchingCandidates(records);
  const continueWatching = applyContinueWatchingPreferences(candidates, preferences);

  return {
    continueWatching,
    hiddenContinueWatchingCount: candidates.length - continueWatching.length,
    startWatching: getStartWatchingItems(records),
    // Summary tiles intentionally represent the full library, independent of display preferences.
    summary: createDashboardSummary(records),
    upcomingEpisodes: getUpcomingEpisodeItems(records),
  };
}

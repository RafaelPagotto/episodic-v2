import {
  calculateProgressPercentage,
  calculateTotalEpisodeCount,
  calculateWatchedEpisodeCount,
  deriveDisplayStatus,
  getNextEpisodeToWatch,
} from "../tracking";
import { DEFAULT_USER_PREFERENCES } from "../preferences/defaults";
import type { UserPreferences } from "../preferences/types";
import {
  shouldFadeShowForPreferences,
  shouldHideShowForPreferences,
} from "../preferences/view-model";

import type {
  ContinueWatchingItem,
  DashboardData,
  DashboardShowRecord,
  DashboardSummary,
} from "./types";

type ContinueWatchingCandidate = Omit<ContinueWatchingItem, "isFaded">;

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

export function getDashboardShowProgress(record: DashboardShowRecord) {
  const totalEpisodeCount = calculateTotalEpisodeCount(record.episodes);
  const watchedEpisodeCount = calculateWatchedEpisodeCount(record.episodes, record.watchedEpisodes);

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
    // Summary tiles intentionally represent the full library, independent of display preferences.
    summary: createDashboardSummary(records),
  };
}

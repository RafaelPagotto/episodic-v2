import { describe, expect, it } from "vitest";

import {
  createDashboardData,
  createDashboardSummary,
  getContinueWatchingItems,
} from "../features/dashboard/view-model";
import type { DashboardShowRecord } from "../features/dashboard/types";
import { DEFAULT_USER_PREFERENCES } from "../features/preferences/defaults";
import type { UserPreferences } from "../features/preferences/types";
import type { Episode, TrackingStatus, WatchedEpisode } from "../features/tracking";

function preferences(overrides: Partial<UserPreferences> = {}): UserPreferences {
  return {
    ...DEFAULT_USER_PREFERENCES,
    ...overrides,
  };
}

function episode(showTmdbId: number, seasonNumber: number, episodeNumber: number): Episode {
  return {
    airDate: null,
    episodeNumber,
    metadata: {},
    overview: null,
    runtimeMinutes: null,
    seasonNumber,
    showTmdbId,
    stillPath: null,
    title: `S${seasonNumber}E${episodeNumber}`,
    tmdbId: null,
  };
}

function watched(
  showTmdbId: number,
  seasonNumber: number,
  episodeNumber: number,
  watchedAt = "2026-05-29T00:00:00.000Z",
): WatchedEpisode {
  return {
    episodeNumber,
    id: episodeNumber,
    seasonNumber,
    showTmdbId,
    userId: "user-1",
    watchedAt,
  };
}

function record({
  favourite = false,
  showTmdbId,
  status,
  tmdbStatus = "Returning Series",
  watchedEpisodes = [],
}: {
  favourite?: boolean;
  showTmdbId: number;
  status: TrackingStatus;
  tmdbStatus?: string | null;
  watchedEpisodes?: WatchedEpisode[];
}): DashboardShowRecord {
  return {
    addedAt: "2026-05-29T00:00:00.000Z",
    episodes: [episode(showTmdbId, 1, 1), episode(showTmdbId, 1, 2), episode(showTmdbId, 1, 3)],
    favourite,
    posterPath: null,
    title: `Show ${showTmdbId}`,
    tmdbId: showTmdbId,
    tmdbStatus,
    trackingStatus: status,
    watchedEpisodes,
  };
}

describe("dashboard view model", () => {
  it("summarizes library counts using derived progress status", () => {
    const summary = createDashboardSummary([
      record({ showTmdbId: 1, status: "watchlist" }),
      record({
        favourite: true,
        showTmdbId: 2,
        status: "watchlist",
        watchedEpisodes: [watched(2, 1, 1)],
      }),
      record({
        showTmdbId: 3,
        tmdbStatus: "Ended",
        status: "watching",
        watchedEpisodes: [watched(3, 1, 1), watched(3, 1, 2), watched(3, 1, 3)],
      }),
      record({
        favourite: true,
        showTmdbId: 4,
        status: "dropped",
        watchedEpisodes: [watched(4, 1, 1)],
      }),
      record({
        showTmdbId: 5,
        status: "watchlist",
        watchedEpisodes: [watched(5, 1, 1), watched(5, 1, 2), watched(5, 1, 3)],
      }),
    ]);

    expect(summary).toEqual({
      caughtUpCount: 1,
      completedCount: 1,
      droppedCount: 1,
      favouriteCount: 2,
      totalShows: 5,
      watchingCount: 1,
      watchlistCount: 1,
    });
  });

  it("excludes dropped shows from Continue Watching by default", () => {
    const records = [
      record({ showTmdbId: 1, status: "watchlist" }),
      record({
        showTmdbId: 2,
        status: "watchlist",
        watchedEpisodes: [watched(2, 1, 1, "2026-05-29T00:00:00.000Z")],
      }),
      record({
        showTmdbId: 3,
        status: "watching",
        watchedEpisodes: [
          watched(3, 1, 1, "2026-05-30T00:00:00.000Z"),
          watched(3, 1, 2, "2026-05-30T00:00:00.000Z"),
          watched(3, 1, 3, "2026-05-30T00:00:00.000Z"),
        ],
      }),
      record({
        showTmdbId: 4,
        status: "dropped",
        watchedEpisodes: [watched(4, 1, 1, "2026-05-31T00:00:00.000Z")],
      }),
    ];
    const items = getContinueWatchingItems(records, preferences());

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      displayStatus: "watching",
      isFaded: false,
      progressPercentage: 33,
      title: "Show 2",
      tmdbId: 2,
      watchedEpisodeCount: 1,
    });
    expect(items[0]?.nextEpisode).toMatchObject({
      episodeNumber: 2,
      seasonNumber: 1,
      title: "S1E2",
    });
    expect(getContinueWatchingItems(records, preferences({ hideDropped: true })).map((item) => item.tmdbId)).toEqual([2]);
  });

  it("keeps summary counts full-library while preferences filter Continue Watching", () => {
    const dashboard = createDashboardData([
      record({
        showTmdbId: 1,
        status: "watching",
        watchedEpisodes: [watched(1, 1, 1)],
      }),
      record({
        showTmdbId: 2,
        status: "dropped",
        watchedEpisodes: [watched(2, 1, 1)],
      }),
      record({
        showTmdbId: 3,
        tmdbStatus: "Ended",
        status: "watched",
        watchedEpisodes: [watched(3, 1, 1), watched(3, 1, 2), watched(3, 1, 3)],
      }),
    ], preferences({ hideCompleted: true, hideDropped: true }));

    expect(dashboard.summary).toMatchObject({
      droppedCount: 1,
      totalShows: 3,
      completedCount: 1,
      watchingCount: 1,
    });
    expect(dashboard.continueWatching).toHaveLength(1);
    expect(dashboard.hiddenContinueWatchingCount).toBe(0);
  });

  it("does not apply search-only added preferences to dashboard cards", () => {
    const records = [
      record({
        showTmdbId: 1,
        status: "watching",
        watchedEpisodes: [watched(1, 1, 1)],
      }),
    ];
    const dashboard = createDashboardData(
      records,
      preferences({ fadeAdded: true, hideAdded: true }),
    );

    expect(dashboard.continueWatching).toHaveLength(1);
    expect(dashboard.continueWatching[0]?.isFaded).toBe(false);
  });
});

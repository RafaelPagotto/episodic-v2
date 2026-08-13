import { describe, expect, it } from "vitest";

import {
  createDashboardData,
  createDashboardSummary,
  getContinueWatchingItems,
  getStartWatchingItems,
  getUpcomingEpisodeItems,
} from "../features/dashboard/view-model";
import type { DashboardShowRecord } from "../features/dashboard/types";
import { DEFAULT_USER_PREFERENCES } from "../features/preferences/defaults";
import type { UserPreferences } from "../features/preferences/types";
import type { Episode, TrackingStatus, WatchedEpisode } from "../features/tracking";
import { calculateTotalEpisodeCount } from "../features/tracking";
import { getDateOnlyForTimeZone } from "../lib/date-only";

function preferences(overrides: Partial<UserPreferences> = {}): UserPreferences {
  return {
    ...DEFAULT_USER_PREFERENCES,
    ...overrides,
  };
}

function episode(
  showTmdbId: number,
  seasonNumber: number,
  episodeNumber: number,
  overrides: Partial<Episode> = {},
): Episode {
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
    ...overrides,
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
  addedAt = "2026-05-29T00:00:00.000Z",
  episodes,
  favourite = false,
  posterPath = null,
  showTmdbId,
  status,
  title = `Show ${showTmdbId}`,
  tmdbStatus = "Returning Series",
  watchedEpisodes = [],
}: {
  addedAt?: string;
  episodes?: Episode[];
  favourite?: boolean;
  posterPath?: string | null;
  showTmdbId: number;
  status: TrackingStatus;
  title?: string;
  tmdbStatus?: string | null;
  watchedEpisodes?: WatchedEpisode[];
}): DashboardShowRecord {
  return {
    addedAt,
    episodes: episodes ?? [episode(showTmdbId, 1, 1), episode(showTmdbId, 1, 2), episode(showTmdbId, 1, 3)],
    favourite,
    posterPath,
    title,
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

  it("exposes the next released unwatched main-series episode and ignores specials", () => {
    const records = [
      record({
        episodes: [
          episode(6, 0, 1),
          episode(6, 1, 1),
          episode(6, 1, 2),
        ],
        showTmdbId: 6,
        status: "watching",
        watchedEpisodes: [watched(6, 0, 1), watched(6, 1, 1)],
      }),
    ];
    const items = getContinueWatchingItems(records, preferences());

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      progressPercentage: 50,
      totalEpisodeCount: 2,
      watchedEpisodeCount: 1,
    });
    expect(items[0]?.nextEpisode).toMatchObject({
      episodeNumber: 2,
      seasonNumber: 1,
      title: "S1E2",
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

  it("excludes dropped, caught-up, completed, and watchlist-only shows from Continue Watching", () => {
    const records = [
      record({
        showTmdbId: 6,
        status: "watchlist",
        watchedEpisodes: [watched(6, 0, 1)],
      }),
      record({
        showTmdbId: 7,
        status: "dropped",
        watchedEpisodes: [watched(7, 1, 1)],
      }),
      record({
        showTmdbId: 8,
        status: "watched",
        watchedEpisodes: [watched(8, 1, 1), watched(8, 1, 2), watched(8, 1, 3)],
      }),
      record({
        showTmdbId: 9,
        status: "watched",
        tmdbStatus: "Ended",
        watchedEpisodes: [watched(9, 1, 1), watched(9, 1, 2), watched(9, 1, 3)],
      }),
    ];

    expect(getContinueWatchingItems(records, preferences())).toEqual([]);
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

  it("includes future main-series episodes for watching and caught-up shows", () => {
    const items = getUpcomingEpisodeItems(
      [
        record({
          episodes: [
            episode(1, 1, 1, { airDate: "2026-06-01" }),
            episode(1, 1, 2, { airDate: "2026-06-02" }),
            episode(1, 1, 3, { airDate: "2026-06-10" }),
          ],
          showTmdbId: 1,
          status: "watching",
          watchedEpisodes: [watched(1, 1, 1)],
        }),
        record({
          episodes: [
            episode(2, 1, 1, { airDate: "2026-06-01" }),
            episode(2, 1, 2, { airDate: "2026-06-08" }),
          ],
          showTmdbId: 2,
          status: "watching",
          watchedEpisodes: [watched(2, 1, 1)],
        }),
      ],
      { referenceDate: "2026-06-07" },
    );

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      airDate: "2026-06-08",
      detailHref: "/shows/2?season=1",
      episodeNumber: 2,
      episodeTitle: "S1E2",
      seasonNumber: 1,
      showTitle: "Show 2",
      tmdbId: 2,
    });
    expect(items[1]).toMatchObject({
      airDate: "2026-06-10",
      detailHref: "/shows/1?season=1",
      episodeNumber: 3,
      seasonNumber: 1,
      tmdbId: 1,
    });
  });

  it("keeps an episode in Upcoming and out of Continue Watching until local release", () => {
    const records = [
      record({
        episodes: [
          episode(99, 1, 1, { airDate: "2026-07-18" }),
          episode(99, 1, 2, { airDate: "2026-07-19" }),
        ],
        showTmdbId: 99,
        status: "watching",
        watchedEpisodes: [watched(99, 1, 1)],
      }),
    ];
    const beforeRelease = {
      referenceDate: new Date("2026-07-19T02:30:00.000Z"),
      timeZone: "America/Sao_Paulo",
    };
    const atRelease = {
      referenceDate: new Date("2026-07-19T03:00:00.000Z"),
      timeZone: "America/Sao_Paulo",
    };

    expect(getContinueWatchingItems(records, preferences(), beforeRelease)).toEqual([]);
    expect(getUpcomingEpisodeItems(records, beforeRelease)).toEqual([
      expect.objectContaining({ airDate: "2026-07-19", episodeNumber: 2, tmdbId: 99 }),
    ]);

    expect(getContinueWatchingItems(records, preferences(), atRelease)).toEqual([
      expect.objectContaining({
        nextEpisode: expect.objectContaining({ episodeNumber: 2 }),
        tmdbId: 99,
      }),
    ]);
    expect(getUpcomingEpisodeItems(records, atRelease)).toEqual([]);
  });

  it("uses a saved Sao Paulo timezone at the August release boundary", () => {
    const episodes = [
      episode(100, 3, 6, { airDate: "2026-08-06" }),
      episode(100, 3, 7, { airDate: "2026-08-13", title: "Radio" }),
    ];
    const records = [
      record({
        episodes,
        showTmdbId: 100,
        status: "watching",
        title: "Silo",
        watchedEpisodes: [watched(100, 3, 6)],
      }),
    ];
    const timeZone = "America/Sao_Paulo";
    const beforeRelease = {
      referenceDate: getDateOnlyForTimeZone(new Date("2026-08-13T00:23:00.000Z"), timeZone),
      timeZone,
    };
    const atRelease = {
      referenceDate: getDateOnlyForTimeZone(new Date("2026-08-13T03:00:00.000Z"), timeZone),
      timeZone,
    };

    expect(beforeRelease.referenceDate).toBe("2026-08-12");
    expect(getContinueWatchingItems(records, preferences(), beforeRelease)).toEqual([]);
    expect(getUpcomingEpisodeItems(records, beforeRelease)).toEqual([
      expect.objectContaining({ episodeNumber: 7, showTitle: "Silo" }),
    ]);
    expect(calculateTotalEpisodeCount(episodes, beforeRelease)).toBe(1);

    expect(atRelease.referenceDate).toBe("2026-08-13");
    expect(getContinueWatchingItems(records, preferences(), atRelease)).toEqual([
      expect.objectContaining({
        nextEpisode: expect.objectContaining({ episodeNumber: 7, title: "Radio" }),
      }),
    ]);
    expect(getUpcomingEpisodeItems(records, atRelease)).toEqual([]);
    expect(calculateTotalEpisodeCount(episodes, atRelease)).toBe(2);
  });

  it("excludes specials, null dates, watched future episodes, and inactive shows", () => {
    const items = getUpcomingEpisodeItems(
      [
        record({
          episodes: [
            episode(10, 1, 1, { airDate: "2026-06-01" }),
            episode(10, 0, 1, { airDate: "2026-06-08" }),
          ],
          showTmdbId: 10,
          status: "watching",
          watchedEpisodes: [watched(10, 1, 1)],
        }),
        record({
          episodes: [
            episode(11, 1, 1, { airDate: "2026-06-01" }),
            episode(11, 1, 2, { airDate: null }),
          ],
          showTmdbId: 11,
          status: "watching",
          watchedEpisodes: [watched(11, 1, 1)],
        }),
        record({
          episodes: [
            episode(12, 1, 1, { airDate: "2026-06-01" }),
            episode(12, 1, 2, { airDate: "2026-06-08" }),
          ],
          showTmdbId: 12,
          status: "watching",
          watchedEpisodes: [watched(12, 1, 1), watched(12, 1, 2)],
        }),
        record({
          episodes: [
            episode(13, 1, 1, { airDate: "2026-06-01" }),
            episode(13, 1, 2, { airDate: "2026-06-08" }),
          ],
          showTmdbId: 13,
          status: "dropped",
          watchedEpisodes: [watched(13, 1, 1)],
        }),
        record({
          episodes: [episode(14, 1, 1, { airDate: "2026-06-08" })],
          showTmdbId: 14,
          status: "watchlist",
        }),
        record({
          episodes: [
            episode(15, 1, 1, { airDate: "2026-06-01" }),
            episode(15, 1, 2, { airDate: "2026-06-08" }),
          ],
          showTmdbId: 15,
          status: "watched",
          tmdbStatus: "Ended",
          watchedEpisodes: [watched(15, 1, 1)],
        }),
      ],
      { referenceDate: "2026-06-07" },
    );

    expect(items).toEqual([]);
  });

  it("selects one nearest future episode per show and sorts shows by that date", () => {
    const items = getUpcomingEpisodeItems(
      [
        record({
          episodes: [
            episode(20, 1, 1, { airDate: "2026-06-01" }),
            episode(20, 1, 2, { airDate: "2026-06-20" }),
            episode(20, 1, 3, { airDate: "2026-06-09" }),
          ],
          showTmdbId: 20,
          status: "watching",
          watchedEpisodes: [watched(20, 1, 1)],
        }),
        record({
          episodes: [
            episode(21, 1, 1, { airDate: "2026-06-01" }),
            episode(21, 3, 1, { airDate: "2026-06-08" }),
          ],
          showTmdbId: 21,
          status: "watching",
          watchedEpisodes: [watched(21, 1, 1)],
        }),
      ],
      { referenceDate: "2026-06-07" },
    );

    expect(items.map((item) => `${item.tmdbId}:${item.seasonNumber}:${item.episodeNumber}`)).toEqual([
      "21:3:1",
      "20:1:3",
    ]);
  });

  it("applies the twelve-item limit after grouping by show", () => {
    const records = Array.from({ length: 13 }, (_, index) => {
      const tmdbId = index + 1;
      const nearestDay = String(8 + index).padStart(2, "0");

      return record({
        episodes: [
          episode(tmdbId, 1, 1, { airDate: "2026-06-01" }),
          episode(tmdbId, 1, 2, { airDate: `2026-06-${nearestDay}` }),
          episode(tmdbId, 1, 3, { airDate: `2026-07-${nearestDay}` }),
        ],
        showTmdbId: tmdbId,
        status: "watching",
        watchedEpisodes: [watched(tmdbId, 1, 1)],
      });
    });

    const items = getUpcomingEpisodeItems(records, { referenceDate: "2026-06-07" });

    expect(items).toHaveLength(12);
    expect(new Set(items.map((item) => item.tmdbId)).size).toBe(12);
    expect(items.map((item) => item.tmdbId)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(items.every((item) => item.episodeNumber === 2)).toBe(true);
  });

  it("includes watchlist shows with no watched main episodes and links to the first released main episode season", () => {
    const items = getStartWatchingItems(
      [
        record({
          episodes: [
            episode(30, 0, 1, { airDate: "2026-06-01" }),
            episode(30, 1, 1, { airDate: "2026-06-01", title: "Pilot" }),
            episode(30, 1, 2, { airDate: "2026-06-02" }),
          ],
          posterPath: "/poster.jpg",
          showTmdbId: 30,
          status: "watchlist",
        }),
      ],
      { referenceDate: "2026-06-07" },
    );

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      detailHref: "/shows/30?season=1",
      episodeNumber: 1,
      episodeTitle: "Pilot",
      posterPath: "/poster.jpg",
      seasonNumber: 1,
      showTitle: "Show 30",
      tmdbId: 30,
    });
  });

  it("excludes partial-progress, caught-up, completed, dropped, future-only, and specials-only shows from Start Watching", () => {
    const items = getStartWatchingItems(
      [
        record({
          episodes: [episode(31, 1, 1), episode(31, 1, 2)],
          showTmdbId: 31,
          status: "watchlist",
          watchedEpisodes: [watched(31, 1, 1)],
        }),
        record({
          episodes: [episode(32, 1, 1), episode(32, 1, 2)],
          showTmdbId: 32,
          status: "watched",
          watchedEpisodes: [watched(32, 1, 1), watched(32, 1, 2)],
        }),
        record({
          episodes: [episode(33, 1, 1), episode(33, 1, 2)],
          showTmdbId: 33,
          status: "watched",
          tmdbStatus: "Ended",
          watchedEpisodes: [watched(33, 1, 1), watched(33, 1, 2)],
        }),
        record({
          episodes: [episode(34, 1, 1)],
          showTmdbId: 34,
          status: "dropped",
        }),
        record({
          episodes: [episode(35, 1, 1, { airDate: "2026-06-08" })],
          showTmdbId: 35,
          status: "watchlist",
        }),
        record({
          episodes: [episode(36, 0, 1, { airDate: "2026-06-01" })],
          showTmdbId: 36,
          status: "watchlist",
        }),
      ],
      { referenceDate: "2026-06-07" },
    );

    expect(items).toEqual([]);
  });

  it("orders Start Watching by recently added date and then title", () => {
    const items = getStartWatchingItems(
      [
        record({
          addedAt: "2026-05-01T00:00:00.000Z",
          showTmdbId: 40,
          status: "watchlist",
          title: "Older",
        }),
        record({
          addedAt: "2026-06-01T00:00:00.000Z",
          showTmdbId: 41,
          status: "watchlist",
          title: "Beta",
        }),
        record({
          addedAt: "2026-06-01T00:00:00.000Z",
          showTmdbId: 42,
          status: "watchlist",
          title: "Alpha",
        }),
      ],
      { referenceDate: "2026-06-07" },
    );

    expect(items.map((item) => item.tmdbId)).toEqual([42, 41, 40]);
  });

  it("limits Start Watching to twelve shows", () => {
    const records = Array.from({ length: 13 }, (_, index) =>
      record({
        addedAt: `2026-06-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`,
        showTmdbId: index + 50,
        status: "watchlist",
      }),
    );

    const items = getStartWatchingItems(records, { referenceDate: "2026-06-07" });

    expect(items).toHaveLength(12);
    expect(items.map((item) => item.tmdbId)).toEqual([
      62, 61, 60, 59, 58, 57, 56, 55, 54, 53, 52, 51,
    ]);
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

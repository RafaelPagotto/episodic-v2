import { describe, expect, it } from "vitest";

import {
  applyOptimisticEpisodeWatched,
  getSeasonLabel,
  getShowDetailActionLabels,
  getShowDetailSeasonNavigation,
  getShowDetailSeasonUrl,
  SHOW_DETAIL_STATUS_LABELS,
  SPECIALS_OPTIONAL_NOTE,
} from "../features/shows";
import type { ShowDetail, ShowDetailEpisode, ShowDetailSeason } from "../features/shows";

function showDetail(overrides: Partial<ShowDetail>): ShowDetail {
  return {
    backdropPath: null,
    favourite: false,
    firstAirDate: null,
    lastSyncedAt: null,
    overview: null,
    posterPath: null,
    progress: {
      displayStatus: "watching",
      progressPercentage: 50,
      status: "watching",
      totalEpisodeCount: 10,
      watchedEpisodeCount: 5,
    },
    seasons: [],
    title: "Arcane",
    tmdbId: 100,
    tmdbStatus: "Returning Series",
    ...overrides,
  };
}

function episode(
  seasonNumber: number,
  episodeNumber: number,
  overrides: Partial<ShowDetailEpisode> = {},
): ShowDetailEpisode {
  return {
    airDate: "2026-01-01",
    episodeNumber,
    overview: null,
    runtimeMinutes: 42,
    seasonNumber,
    stillPath: null,
    title: `S${seasonNumber}E${episodeNumber}`,
    watched: false,
    ...overrides,
  };
}

function season(
  seasonNumber: number,
  episodes: ShowDetailEpisode[],
  overrides: Partial<ShowDetailSeason> = {},
): ShowDetailSeason {
  return {
    airDate: "2026-01-01",
    episodeCount: episodes.length,
    episodes,
    name: `Season ${seasonNumber}`,
    overview: null,
    posterPath: null,
    progress: {
      displayStatus: "watchlist",
      progressPercentage: 0,
      status: "watchlist",
      totalEpisodeCount: episodes.length,
      watchedEpisodeCount: episodes.filter((seasonEpisode) => seasonEpisode.watched).length,
    },
    seasonNumber,
    ...overrides,
  };
}

describe("show detail view model", () => {
  it("updates main and season progress while leaving Specials out of main progress", () => {
    const show = showDetail({
      progress: { displayStatus: "watching", progressPercentage: 50, status: "watching", totalEpisodeCount: 2, watchedEpisodeCount: 1 },
      seasons: [
        season(0, [episode(0, 1)], {
          progress: { displayStatus: "watchlist", progressPercentage: 0, status: "watching", totalEpisodeCount: 1, watchedEpisodeCount: 0 },
        }),
        season(1, [episode(1, 1, { watched: true }), episode(1, 2)], {
          progress: { displayStatus: "watching", progressPercentage: 50, status: "watching", totalEpisodeCount: 2, watchedEpisodeCount: 1 },
        }),
      ],
    });

    const optimistic = applyOptimisticEpisodeWatched(show, { "0:1": true, "1:2": true }, { referenceDate: "2026-09-14" });

    expect(optimistic.seasons[0]?.episodes[0]?.watched).toBe(true);
    expect(optimistic.seasons[0]?.progress.watchedEpisodeCount).toBe(1);
    expect(optimistic.seasons[1]?.progress.progressPercentage).toBe(100);
    expect(optimistic.progress).toMatchObject({
      displayStatus: "caught_up",
      progressPercentage: 100,
      status: "watched",
      watchedEpisodeCount: 2,
    });
    expect(show.progress.watchedEpisodeCount).toBe(1);
  });

  it("preserves dropped status and excludes a future cleanup from released counts", () => {
    const show = showDetail({
      progress: { displayStatus: "dropped", progressPercentage: 100, status: "dropped", totalEpisodeCount: 1, watchedEpisodeCount: 1 },
      seasons: [season(1, [
        episode(1, 1, { watched: true }),
        episode(1, 2, { airDate: "2026-09-21", watched: true }),
      ], {
        progress: { displayStatus: "dropped", progressPercentage: 100, status: "dropped", totalEpisodeCount: 1, watchedEpisodeCount: 1 },
      })],
    });

    const optimistic = applyOptimisticEpisodeWatched(show, { "1:2": false }, { referenceDate: "2026-09-14" });

    expect(optimistic.seasons[0]?.episodes[1]?.watched).toBe(false);
    expect(optimistic.seasons[0]?.progress.watchedEpisodeCount).toBe(1);
    expect(optimistic.progress).toMatchObject({ status: "dropped", displayStatus: "dropped", watchedEpisodeCount: 1 });
  });
  it("labels favourite and unfavourite actions", () => {
    expect(getShowDetailActionLabels(showDetail({ favourite: false }))).toMatchObject({
      favouriteAriaLabel: "Add Arcane to favourites",
      favouriteButtonLabel: "Favourite",
    });

    expect(getShowDetailActionLabels(showDetail({ favourite: true }))).toMatchObject({
      favouriteAriaLabel: "Remove Arcane from favourites",
      favouriteButtonLabel: "Unfavourite",
    });
  });

  it("labels drop and resume according to derived display status", () => {
    expect(getShowDetailActionLabels(showDetail({}))).toMatchObject({
      isDropped: false,
      toggleDroppedAriaLabel: "Drop Arcane",
      toggleDroppedButtonLabel: "Drop",
    });

    expect(
      getShowDetailActionLabels(
        showDetail({
          progress: {
            displayStatus: "dropped",
            progressPercentage: 50,
            status: "dropped",
            totalEpisodeCount: 10,
            watchedEpisodeCount: 5,
          },
        }),
      ),
    ).toMatchObject({
      isDropped: true,
      toggleDroppedAriaLabel: "Resume Arcane",
      toggleDroppedButtonLabel: "Resume",
    });
  });

  it("keeps caught up and completed as display-only labels", () => {
    expect(SHOW_DETAIL_STATUS_LABELS.caught_up).toBe("Caught up");
    expect(SHOW_DETAIL_STATUS_LABELS.completed).toBe("Completed");
  });

  it("returns only the selected season episodes", () => {
    const show = showDetail({
      seasons: [
        season(1, [episode(1, 1)]),
        season(2, [episode(2, 1), episode(2, 2)]),
      ],
    });
    const navigation = getShowDetailSeasonNavigation(show, "2");

    expect(navigation.activeSeason?.episodes.map((seasonEpisode) => seasonEpisode.title)).toEqual([
      "S2E1",
      "S2E2",
    ]);
  });

  it("uses a valid season query param as the active season", () => {
    const show = showDetail({
      seasons: [
        season(1, [episode(1, 1)]),
        season(2, [episode(2, 1)]),
      ],
    });

    expect(getShowDetailSeasonNavigation(show, "2").activeSeasonNumber).toBe(2);
  });

  it("builds a season query URL while preserving other query params", () => {
    expect(getShowDetailSeasonUrl("/shows/100", "", 2)).toBe("/shows/100?season=2");
    expect(getShowDetailSeasonUrl("/shows/100", "?tab=episodes", 2)).toBe("/shows/100?tab=episodes&season=2");
    expect(getShowDetailSeasonUrl("/shows/100", "?season=1&tab=episodes", 2)).toBe(
      "/shows/100?season=2&tab=episodes",
    );
  });

  it("falls back from an invalid season query param to the computed default", () => {
    const show = showDetail({
      progress: {
        displayStatus: "watching",
        progressPercentage: 50,
        status: "watching",
        totalEpisodeCount: 2,
        watchedEpisodeCount: 1,
      },
      seasons: [
        season(1, [episode(1, 1, { watched: true })]),
        season(2, [episode(2, 1)]),
      ],
    });

    expect(getShowDetailSeasonNavigation(show, "999").activeSeasonNumber).toBe(2);
    expect(getShowDetailSeasonNavigation(show, "season-two").activeSeasonNumber).toBe(2);
  });

  it("defaults to the season containing the next released unwatched main episode when watching", () => {
    const show = showDetail({
      progress: {
        displayStatus: "watching",
        progressPercentage: 50,
        status: "watching",
        totalEpisodeCount: 2,
        watchedEpisodeCount: 1,
      },
      seasons: [
        season(1, [episode(1, 1, { watched: true })]),
        season(2, [episode(2, 1)]),
      ],
    });

    expect(getShowDetailSeasonNavigation(show, null).activeSeasonNumber).toBe(2);
  });

  it("defaults to the latest watched main season when no next released episode exists", () => {
    const show = showDetail({
      progress: {
        displayStatus: "watching",
        progressPercentage: 67,
        status: "watching",
        totalEpisodeCount: 3,
        watchedEpisodeCount: 2,
      },
      seasons: [
        season(1, [episode(1, 1, { watched: true })]),
        season(2, [episode(2, 1, { watched: true })]),
        season(3, [episode(3, 1, { airDate: "2027-01-01" })]),
      ],
    });

    expect(
      getShowDetailSeasonNavigation(show, null, { referenceDate: "2026-06-07" }).activeSeasonNumber,
    ).toBe(2);
  });

  it("moves the default season only when the next episode releases in the user's timezone", () => {
    const show = showDetail({
      progress: {
        displayStatus: "caught_up",
        progressPercentage: 100,
        status: "watching",
        totalEpisodeCount: 1,
        watchedEpisodeCount: 1,
      },
      seasons: [
        season(1, [episode(1, 1, { airDate: "2026-07-18", watched: true })]),
        season(2, [episode(2, 1, { airDate: "2026-07-19" })]),
      ],
    });

    expect(
      getShowDetailSeasonNavigation(show, null, {
        referenceDate: new Date("2026-07-19T02:30:00.000Z"),
        timeZone: "America/Sao_Paulo",
      }).activeSeasonNumber,
    ).toBe(1);
    expect(
      getShowDetailSeasonNavigation(show, null, {
        referenceDate: new Date("2026-07-19T03:00:00.000Z"),
        timeZone: "America/Sao_Paulo",
      }).activeSeasonNumber,
    ).toBe(2);
  });

  it("defaults caught up and completed shows to the latest released main season", () => {
    const caughtUpShow = showDetail({
      progress: {
        displayStatus: "caught_up",
        progressPercentage: 100,
        status: "watched",
        totalEpisodeCount: 2,
        watchedEpisodeCount: 2,
      },
      seasons: [
        season(1, [episode(1, 1, { watched: true })]),
        season(2, [episode(2, 1, { watched: true })]),
        season(3, [episode(3, 1, { airDate: "2027-01-01" })]),
      ],
    });
    const completedShow = showDetail({
      ...caughtUpShow,
      progress: {
        ...caughtUpShow.progress,
        displayStatus: "completed",
      },
      tmdbStatus: "Ended",
    });

    expect(
      getShowDetailSeasonNavigation(caughtUpShow, null, { referenceDate: "2026-06-07" }).activeSeasonNumber,
    ).toBe(2);
    expect(
      getShowDetailSeasonNavigation(completedShow, null, { referenceDate: "2026-06-07" }).activeSeasonNumber,
    ).toBe(2);
  });

  it("defaults watchlist shows with no progress to Season 1", () => {
    const show = showDetail({
      progress: {
        displayStatus: "watchlist",
        progressPercentage: 0,
        status: "watchlist",
        totalEpisodeCount: 2,
        watchedEpisodeCount: 0,
      },
      seasons: [
        season(0, [episode(0, 1)]),
        season(1, [episode(1, 1)]),
        season(2, [episode(2, 1)]),
      ],
    });

    expect(getShowDetailSeasonNavigation(show, null).activeSeasonNumber).toBe(1);
  });

  it("includes Specials in navigation and falls back to Specials when there are no main seasons", () => {
    const specials = season(0, [episode(0, 1)], { name: "Specials" });
    const show = showDetail({
      seasons: [specials],
    });
    const navigation = getShowDetailSeasonNavigation(show, null);

    expect(navigation.activeSeasonNumber).toBe(0);
    expect(navigation.seasonOptions).toEqual([{ label: "Specials", seasonNumber: 0 }]);
    expect(getSeasonLabel(specials)).toBe("Specials");
    expect(SPECIALS_OPTIONAL_NOTE).toContain("do not affect main progress");
  });

  it("selects Specials from the season query param and exposes previous and next season buttons", () => {
    const show = showDetail({
      seasons: [
        season(0, [episode(0, 1)], { name: "Specials" }),
        season(1, [episode(1, 1)]),
        season(2, [episode(2, 1)]),
      ],
    });

    expect(getShowDetailSeasonNavigation(show, "0").activeSeasonNumber).toBe(0);
    expect(getShowDetailSeasonNavigation(show, "1")).toMatchObject({
      activeSeasonNumber: 1,
      nextSeasonNumber: 2,
      previousSeasonNumber: 0,
    });
    expect(getShowDetailSeasonNavigation(show, "0").previousSeasonNumber).toBeNull();
    expect(getShowDetailSeasonNavigation(show, "2").nextSeasonNumber).toBeNull();
  });
});

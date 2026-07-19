import { describe, expect, it } from "vitest";

import {
  calculateProgressPercentage,
  calculateTotalEpisodeCount,
  calculateWatchedEpisodeCount,
  deriveDisplayStatus,
  deriveTrackingStatusAfterProgressChange,
  getNextEpisodeToWatch,
  getReleasedSpecialEpisodes,
  getReleasedTrackableEpisodes,
  isMainSeriesEpisode,
  isEpisodeTrackable,
  isSpecialEpisode,
  isTrackingStatus,
  isShowCompleted,
} from "../features/tracking";
import type { Episode, WatchedEpisode } from "../features/tracking";

function episode(seasonNumber: number, episodeNumber: number, airDate: string | null = null): Episode {
  return {
    airDate,
    episodeNumber,
    metadata: {},
    overview: null,
    runtimeMinutes: null,
    seasonNumber,
    showTmdbId: 100,
    stillPath: null,
    title: `Episode ${episodeNumber}`,
    tmdbId: null,
  };
}

function watched(seasonNumber: number, episodeNumber: number): WatchedEpisode {
  return {
    episodeNumber,
    id: episodeNumber,
    seasonNumber,
    showTmdbId: 100,
    userId: "user-1",
    watchedAt: "2026-05-29T00:00:00.000Z",
  };
}

describe("tracking progress helpers", () => {
  it("counts unique total episodes and matching watched episodes", () => {
    const episodes = [episode(1, 1), episode(1, 2), episode(1, 2), episode(1, 3)];
    const watchedEpisodes = [watched(1, 1), watched(1, 1), watched(1, 4)];

    expect(calculateTotalEpisodeCount(episodes)).toBe(3);
    expect(calculateWatchedEpisodeCount(episodes, watchedEpisodes)).toBe(1);
  });

  it("excludes future episodes from trackable counts when air dates are available", () => {
    const episodes = [
      episode(1, 1, "2026-01-01"),
      episode(1, 2, "2026-01-08"),
      episode(1, 3, "2026-02-01"),
    ];
    const options = { referenceDate: "2026-01-15T00:00:00.000Z" };

    expect(calculateTotalEpisodeCount(episodes, options)).toBe(2);
    expect(calculateWatchedEpisodeCount(episodes, [watched(1, 1), watched(1, 3)], options)).toBe(1);
  });

  it("changes release eligibility at local midnight in America/Sao_Paulo", () => {
    const julyNineteenth = episode(1, 1, "2026-07-19");
    const options = { timeZone: "America/Sao_Paulo" };

    expect(
      isEpisodeTrackable(julyNineteenth, {
        ...options,
        referenceDate: new Date("2026-07-19T02:30:00.000Z"),
      }),
    ).toBe(false);
    expect(
      isEpisodeTrackable(julyNineteenth, {
        ...options,
        referenceDate: new Date("2026-07-19T03:00:00.000Z"),
      }),
    ).toBe(true);
  });

  it("changes release eligibility at local midnight in a positive-offset timezone", () => {
    const julyNineteenth = episode(1, 1, "2026-07-19");
    const options = { timeZone: "Pacific/Kiritimati" };

    expect(
      isEpisodeTrackable(julyNineteenth, {
        ...options,
        referenceDate: new Date("2026-07-18T09:30:00.000Z"),
      }),
    ).toBe(false);
    expect(
      isEpisodeTrackable(julyNineteenth, {
        ...options,
        referenceDate: new Date("2026-07-18T10:00:00.000Z"),
      }),
    ).toBe(true);
  });

  it("updates progress and display status only on the user's local release date", () => {
    const episodes = [episode(1, 1, "2026-07-18"), episode(1, 2, "2026-07-19")];
    const watchedEpisodes = [watched(1, 1)];
    const beforeRelease = {
      referenceDate: new Date("2026-07-19T02:30:00.000Z"),
      timeZone: "America/Sao_Paulo",
    };
    const atRelease = {
      referenceDate: new Date("2026-07-19T03:00:00.000Z"),
      timeZone: "America/Sao_Paulo",
    };
    const beforeTotal = calculateTotalEpisodeCount(episodes, beforeRelease);
    const afterTotal = calculateTotalEpisodeCount(episodes, atRelease);

    expect(beforeTotal).toBe(1);
    expect(afterTotal).toBe(2);
    expect(
      deriveDisplayStatus({
        tmdbStatus: "Returning Series",
        totalEpisodeCount: beforeTotal,
        trackingStatus: "watching",
        watchedEpisodeCount: calculateWatchedEpisodeCount(episodes, watchedEpisodes, beforeRelease),
      }),
    ).toBe("caught_up");
    expect(
      deriveDisplayStatus({
        tmdbStatus: "Returning Series",
        totalEpisodeCount: afterTotal,
        trackingStatus: "watching",
        watchedEpisodeCount: calculateWatchedEpisodeCount(episodes, watchedEpisodes, atRelease),
      }),
    ).toBe("watching");
  });

  it("preserves trackable behavior for null and invalid air dates", () => {
    expect(isEpisodeTrackable(episode(1, 1, null), { referenceDate: "2026-07-18" })).toBe(true);
    expect(isEpisodeTrackable(episode(1, 2, "2026-02-29"), { referenceDate: "2026-07-18" })).toBe(true);
  });

  it("classifies specials and excludes season 0 from main progress counts", () => {
    const episodes = [episode(0, 1), episode(1, 1), episode(1, 2)];

    expect(isSpecialEpisode(episodes[0])).toBe(true);
    expect(isMainSeriesEpisode(episodes[1])).toBe(true);
    expect(getReleasedSpecialEpisodes(episodes)).toEqual([episodes[0]]);
    expect(getReleasedTrackableEpisodes(episodes)).toEqual([episodes[1], episodes[2]]);
    expect(calculateTotalEpisodeCount(episodes)).toBe(2);
    expect(calculateWatchedEpisodeCount(episodes, [watched(0, 1), watched(1, 1)])).toBe(1);
  });

  it("calculates rounded progress and clamps invalid counts", () => {
    expect(calculateProgressPercentage({ totalEpisodeCount: 0, watchedEpisodeCount: 5 })).toBe(0);
    expect(calculateProgressPercentage({ totalEpisodeCount: 3, watchedEpisodeCount: 1 })).toBe(33);
    expect(calculateProgressPercentage({ totalEpisodeCount: 3, watchedEpisodeCount: 4 })).toBe(100);
  });

  it("finds the first unwatched episode in season order", () => {
    const episodes = [episode(2, 1), episode(1, 2), episode(1, 1)];
    const nextEpisode = getNextEpisodeToWatch(episodes, [watched(1, 1)]);

    expect(nextEpisode).toMatchObject({
      episodeNumber: 2,
      seasonNumber: 1,
    });
  });

  it("ignores specials when finding the next main episode to watch", () => {
    const episodes = [episode(0, 1), episode(1, 1), episode(1, 2)];
    const nextEpisode = getNextEpisodeToWatch(episodes, []);

    expect(nextEpisode).toMatchObject({
      episodeNumber: 1,
      seasonNumber: 1,
    });
  });

  it("returns null for next episode when the show is complete", () => {
    const episodes = [episode(1, 1), episode(1, 2)];
    const watchedEpisodes = [watched(1, 1), watched(1, 2)];

    expect(getNextEpisodeToWatch(episodes, watchedEpisodes)).toBeNull();
    expect(isShowCompleted(episodes, watchedEpisodes)).toBe(true);
  });

  it("does not treat shows with no episodes as completed", () => {
    expect(isShowCompleted([], [])).toBe(false);
  });

  it("derives display status from progress and lifecycle metadata", () => {
    expect(
      deriveDisplayStatus({
        totalEpisodeCount: 10,
        trackingStatus: "watchlist",
        watchedEpisodeCount: 1,
      }),
    ).toBe("watching");
    expect(
      deriveDisplayStatus({
        tmdbStatus: "Returning Series",
        totalEpisodeCount: 10,
        trackingStatus: "watching",
        watchedEpisodeCount: 10,
      }),
    ).toBe("caught_up");
    expect(
      deriveDisplayStatus({
        tmdbStatus: "Ended",
        totalEpisodeCount: 10,
        trackingStatus: "watching",
        watchedEpisodeCount: 10,
      }),
    ).toBe("completed");
    expect(
      deriveDisplayStatus({
        tmdbStatus: "Canceled",
        totalEpisodeCount: 10,
        trackingStatus: "dropped",
        watchedEpisodeCount: 10,
      }),
    ).toBe("dropped");
    expect(
      deriveDisplayStatus({
        totalEpisodeCount: 10,
        trackingStatus: "watched",
        watchedEpisodeCount: 0,
      }),
    ).toBe("watchlist");
    expect(
      deriveDisplayStatus({
        totalEpisodeCount: 10,
        trackingStatus: "watched",
        watchedEpisodeCount: 10,
      }),
    ).toBe("caught_up");
  });

  it("does not let future episodes prevent caught up status until they release", () => {
    const episodes = [
      episode(1, 1, "2026-01-01"),
      episode(1, 2, "2026-01-08"),
      episode(1, 3, "2026-02-01"),
    ];
    const watchedEpisodes = [watched(1, 1), watched(1, 2)];
    const beforeRelease = { referenceDate: "2026-01-15T00:00:00.000Z" };
    const afterRelease = { referenceDate: "2026-02-02T00:00:00.000Z" };

    expect(
      deriveDisplayStatus({
        tmdbStatus: "Returning Series",
        totalEpisodeCount: calculateTotalEpisodeCount(episodes, beforeRelease),
        trackingStatus: "watchlist",
        watchedEpisodeCount: calculateWatchedEpisodeCount(episodes, watchedEpisodes, beforeRelease),
      }),
    ).toBe("caught_up");
    expect(
      deriveDisplayStatus({
        tmdbStatus: "Returning Series",
        totalEpisodeCount: calculateTotalEpisodeCount(episodes, afterRelease),
        trackingStatus: "watchlist",
        watchedEpisodeCount: calculateWatchedEpisodeCount(episodes, watchedEpisodes, afterRelease),
      }),
    ).toBe("watching");
  });

  it("does not let unwatched specials prevent completed or caught up statuses", () => {
    const episodes = [episode(0, 1), episode(1, 1), episode(1, 2)];
    const watchedEpisodes = [watched(1, 1), watched(1, 2)];
    const totalEpisodeCount = calculateTotalEpisodeCount(episodes);
    const watchedEpisodeCount = calculateWatchedEpisodeCount(episodes, watchedEpisodes);

    expect(isShowCompleted(episodes, watchedEpisodes)).toBe(true);
    expect(
      deriveDisplayStatus({
        tmdbStatus: "Ended",
        totalEpisodeCount,
        trackingStatus: "watching",
        watchedEpisodeCount,
      }),
    ).toBe("completed");
    expect(
      deriveDisplayStatus({
        tmdbStatus: "Returning Series",
        totalEpisodeCount,
        trackingStatus: "watching",
        watchedEpisodeCount,
      }),
    ).toBe("caught_up");
    expect(
      deriveDisplayStatus({
        tmdbStatus: "Ended",
        totalEpisodeCount,
        trackingStatus: "dropped",
        watchedEpisodeCount,
      }),
    ).toBe("dropped");
  });

  it("derives stored tracking status after progress changes", () => {
    expect(
      deriveTrackingStatusAfterProgressChange({
        totalEpisodeCount: 10,
        trackingStatus: "watchlist",
        watchedEpisodeCount: 1,
      }),
    ).toBe("watching");
    expect(
      deriveTrackingStatusAfterProgressChange({
        totalEpisodeCount: 10,
        trackingStatus: "watching",
        watchedEpisodeCount: 10,
      }),
    ).toBe("watched");
    expect(
      deriveTrackingStatusAfterProgressChange({
        totalEpisodeCount: 10,
        trackingStatus: "watching",
        watchedEpisodeCount: 0,
      }),
    ).toBe("watchlist");
    expect(
      deriveTrackingStatusAfterProgressChange({
        totalEpisodeCount: 10,
        trackingStatus: "watched",
        watchedEpisodeCount: 0,
      }),
    ).toBe("watchlist");
    expect(
      deriveTrackingStatusAfterProgressChange({
        totalEpisodeCount: 10,
        trackingStatus: "dropped",
        watchedEpisodeCount: 10,
      }),
    ).toBe("dropped");
  });

  it("validates tracking statuses at runtime", () => {
    expect(isTrackingStatus("watchlist")).toBe(true);
    expect(isTrackingStatus("dropped")).toBe(true);
    expect(isTrackingStatus("paused")).toBe(false);
    expect(isTrackingStatus(null)).toBe(false);
  });
});

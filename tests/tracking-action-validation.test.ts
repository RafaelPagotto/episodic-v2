import { describe, expect, it } from "vitest";

import {
  isEpisodeNumber,
  isEpisodeWatchedActionInput,
  isDropShowActionInput,
  isFavouriteActionInput,
  isSeasonNumber,
  isSeasonWatchedActionInput,
  isShowTmdbId,
} from "../features/tracking/action-validation";
import { POSTGRES_INTEGER_MAX } from "../lib/validations/numbers";

describe("show server action validation", () => {
  it("accepts only numeric TMDB ids within the database integer range", () => {
    expect(isShowTmdbId(1)).toBe(true);
    expect(isShowTmdbId(POSTGRES_INTEGER_MAX)).toBe(true);
    expect(isShowTmdbId("1")).toBe(false);
    expect(isShowTmdbId(0)).toBe(false);
    expect(isShowTmdbId(POSTGRES_INTEGER_MAX + 1)).toBe(false);
  });

  it("validates season and episode number ranges", () => {
    expect(isSeasonNumber(0)).toBe(true);
    expect(isSeasonNumber(POSTGRES_INTEGER_MAX)).toBe(true);
    expect(isSeasonNumber(-1)).toBe(false);
    expect(isEpisodeNumber(1)).toBe(true);
    expect(isEpisodeNumber(0)).toBe(false);
    expect(isEpisodeNumber(1.5)).toBe(false);
  });

  it("requires complete episode watched inputs with a strict boolean", () => {
    expect(
      isEpisodeWatchedActionInput({
        episodeNumber: 2,
        seasonNumber: 1,
        tmdbId: 100,
        watched: false,
      }),
    ).toBe(true);
    expect(
      isEpisodeWatchedActionInput({
        episodeNumber: 2,
        seasonNumber: 1,
        tmdbId: 100,
        watched: "false",
      }),
    ).toBe(false);
    expect(isEpisodeWatchedActionInput(null)).toBe(false);
  });

  it("requires complete season watched inputs with a strict boolean", () => {
    expect(isSeasonWatchedActionInput({ seasonNumber: 0, tmdbId: 100, watched: true })).toBe(true);
    expect(isSeasonWatchedActionInput({ seasonNumber: -1, tmdbId: 100, watched: true })).toBe(false);
    expect(isSeasonWatchedActionInput({ seasonNumber: 1, tmdbId: 100, watched: 1 })).toBe(false);
  });

  it("requires strict favourite and dropped booleans", () => {
    expect(isFavouriteActionInput({ favourite: true, tmdbId: 100 })).toBe(true);
    expect(isFavouriteActionInput({ favourite: "true", tmdbId: 100 })).toBe(false);
    expect(isDropShowActionInput({ dropped: true, tmdbId: 100 })).toBe(true);
    expect(isDropShowActionInput({ dropped: "true", tmdbId: 100 })).toBe(false);
  });
});

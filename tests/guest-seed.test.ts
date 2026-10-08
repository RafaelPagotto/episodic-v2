import { describe, expect, it } from "vitest";
import { buildGuestSeed } from "../features/guest/seed";
import { DEMO_SHOWS } from "../features/guest/catalogue";
import { getDateOnlyForTimeZone } from "../lib/date-only";

describe("demo seed progress", () => {
  const episodes = DEMO_SHOWS.flatMap((show) => [
    { showTmdbId: show.tmdbId, seasonNumber: 0, episodeNumber: 1, airDate: "2020-01-01" },
    { showTmdbId: show.tmdbId, seasonNumber: 1, episodeNumber: 3, airDate: "2026-10-08" },
    { showTmdbId: show.tmdbId, seasonNumber: 1, episodeNumber: 2, airDate: "2026-10-07" },
    { showTmdbId: show.tmdbId, seasonNumber: 1, episodeNumber: 1, airDate: "2020-01-01" },
  ]);
  it("uses canonical date semantics, excludes Specials/future and leaves Fallout outside the initial library", () => {
    const seed = buildGuestSeed(episodes, { referenceDate: "2026-10-07" });
    expect(seed.library).toHaveLength(5);
    expect(seed.library.map((row) => row.show_tmdb_id)).not.toContain(106379);
    expect(seed.watched.every((row) => row.season_number === 1 && row.episode_number <= 2)).toBe(true);
    expect(seed.watched.filter((row) => row.show_tmdb_id === 1396).map((row) => row.episode_number)).toEqual([1, 2]);
    expect(seed.library.find((row) => row.show_tmdb_id === 2316)?.status).toBe("dropped");
    expect(seed.library.find((row) => row.show_tmdb_id === 125988)?.status).toBe("watchlist");
  });
  it("respects the saved timezone at midnight boundaries", () => {
    const instant = new Date("2026-10-07T01:00:00Z");
    const timeZone = "America/Sao_Paulo";
    const seed = buildGuestSeed(episodes, { timeZone, referenceDate: getDateOnlyForTimeZone(instant, timeZone) });
    expect(seed.watched.every((row) => row.episode_number === 1)).toBe(true);
  });
  it("preserves unknown-date trackability without changing the progress engine", () => {
    const seed = buildGuestSeed([{ showTmdbId: 70523, seasonNumber: 1, episodeNumber: 1, airDate: null }], { referenceDate: "2026-10-07" });
    expect(seed.watched).toEqual([{ show_tmdb_id: 70523, season_number: 1, episode_number: 1 }]);
  });
});

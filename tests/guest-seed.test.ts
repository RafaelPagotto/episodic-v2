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
    expect(seed.library).toHaveLength(20);
    expect(seed.library.map((row) => row.show_tmdb_id)).not.toContain(106379);
    expect(seed.watched.every((row) => row.season_number === 1 && row.episode_number <= 2)).toBe(true);
    expect(seed.watched.filter((row) => row.show_tmdb_id === 1396).map((row) => row.episode_number)).toEqual([1, 2]);
    expect(seed.library.find((row) => row.show_tmdb_id === 2316)?.status).toBe("dropped");
    expect(seed.library.find((row) => row.show_tmdb_id === 125988)?.status).toBe("watchlist");
  });
  it("provides varied progress, favourites and all derived statuses from cached episodes", async () => {
    const { deriveDisplayStatus } = await import("../features/tracking/progress");
    const cached = DEMO_SHOWS.flatMap((show) => Array.from({ length: 100 }, (_, index) => ({
      showTmdbId: show.tmdbId, seasonNumber: 1, episodeNumber: index + 1, airDate: "2020-01-01",
    })));
    const seed = buildGuestSeed(cached, { referenceDate: "2026-10-19" });
    expect(DEMO_SHOWS).toHaveLength(21);
    expect(new Set(DEMO_SHOWS.map((show) => show.tmdbId)).size).toBe(21);
    expect(seed.library.filter((row) => row.favourite)).toHaveLength(5);
    expect(seed.library.filter((row) => row.status === "dropped")).toHaveLength(2);
    expect(seed.library.filter((row) => row.status === "watchlist")).toHaveLength(4);
    expect(seed.watched.filter((row) => row.show_tmdb_id === 60059)).toHaveLength(32);
    expect(seed.watched.filter((row) => row.show_tmdb_id === 76331)).toHaveLength(20);
    expect(seed.watched.filter((row) => row.show_tmdb_id === 63247)).toHaveLength(8);
    const statuses = seed.library.map((row) => deriveDisplayStatus({
      trackingStatus: row.status, totalEpisodeCount: 100,
      watchedEpisodeCount: seed.watched.filter((episode) => episode.show_tmdb_id === row.show_tmdb_id).length,
      tmdbStatus: [95396,100088,93740].includes(row.show_tmdb_id) ? "Returning Series" : "Ended",
    }));
    expect(statuses.filter((status) => status === "watchlist")).toHaveLength(4);
    expect(statuses.filter((status) => status === "watching")).toHaveLength(6);
    expect(statuses.filter((status) => status === "completed")).toHaveLength(5);
    expect(statuses.filter((status) => status === "caught_up")).toHaveLength(3);
    expect(statuses.filter((status) => status === "dropped")).toHaveLength(2);
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

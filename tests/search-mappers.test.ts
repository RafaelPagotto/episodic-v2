import { describe, expect, it } from "vitest";

import {
  mapTmdbEpisodeToEpisodeInsert,
  mapTmdbSeasonToSeasonInsert,
  mapTmdbShowToShowInsert,
} from "../features/search/mappers";
import type { NormalizedTmdbFullShow } from "../lib/tmdb/types";

const syncedAt = "2026-05-31T00:00:00.000Z";

const tmdbShow: NormalizedTmdbFullShow = {
  attribution: {
    notice: "This product uses the TMDB API but is not endorsed or certified by TMDB.",
    sourceName: "TMDB",
    sourceUrl: "https://www.themoviedb.org",
  },
  episodes: [
    {
      airDate: "2008-01-20",
      episodeNumber: 1,
      episodeType: "standard",
      overview: "Pilot episode.",
      runtimeMinutes: 58,
      seasonNumber: 1,
      showTmdbId: 1396,
      stillPath: "/still.jpg",
      title: "Pilot",
      tmdbId: 62085,
      voteAverage: 8.2,
      voteCount: 120,
    },
  ],
  seasons: [
    {
      airDate: "2008-01-20",
      episodeCount: 7,
      episodes: [],
      name: "Season 1",
      overview: "First season.",
      posterPath: "/season.jpg",
      seasonNumber: 1,
      showTmdbId: 1396,
      tmdbId: 3572,
      voteAverage: 8,
    },
  ],
  show: {
    backdropPath: "/backdrop.jpg",
    episodeRunTime: [45],
    firstAirDate: "2008-01-20",
    genres: [{ id: 18, name: "Drama" }],
    homepage: "https://example.com",
    inProduction: false,
    languages: ["en"],
    lastAirDate: "2013-09-29",
    networks: [{ id: 174, logoPath: "/amc.png", name: "AMC", originCountry: "US" }],
    numberOfEpisodes: 62,
    numberOfSeasons: 5,
    originCountries: ["US"],
    originalLanguage: "en",
    originalTitle: "Breaking Bad",
    overview: "A chemistry teacher starts cooking.",
    popularity: 120,
    posterPath: "/poster.jpg",
    status: "Ended",
    tagline: "Change the equation.",
    title: "Breaking Bad",
    tmdbId: 1396,
    type: "Scripted",
    voteAverage: 8.9,
    voteCount: 13000,
  },
};

describe("search mappers", () => {
  it("maps normalized TMDB show details into a shows insert row", () => {
    expect(mapTmdbShowToShowInsert(tmdbShow, syncedAt)).toMatchObject({
      backdrop_path: "/backdrop.jpg",
      first_air_date: "2008-01-20",
      genres: [{ id: 18, name: "Drama" }],
      last_synced_at: syncedAt,
      metadata: {
        episodeRunTime: [45],
        numberOfEpisodes: 62,
        originCountries: ["US"],
      },
      poster_path: "/poster.jpg",
      title: "Breaking Bad",
      tmdb_id: 1396,
      tmdb_status: "Ended",
    });
  });

  it("maps normalized TMDB seasons and episodes into insert rows", () => {
    expect(mapTmdbSeasonToSeasonInsert(tmdbShow.seasons[0], syncedAt)).toMatchObject({
      episode_count: 7,
      last_synced_at: syncedAt,
      name: "Season 1",
      season_number: 1,
      show_tmdb_id: 1396,
      tmdb_id: 3572,
    });

    expect(mapTmdbEpisodeToEpisodeInsert(tmdbShow.episodes[0], syncedAt)).toMatchObject({
      episode_number: 1,
      last_synced_at: syncedAt,
      runtime_minutes: 58,
      season_number: 1,
      show_tmdb_id: 1396,
      title: "Pilot",
      tmdb_id: 62085,
    });
  });
});

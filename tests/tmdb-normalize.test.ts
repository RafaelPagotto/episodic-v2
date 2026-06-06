import { describe, expect, it } from "vitest";

import {
  normalizeFullShowDetails,
  normalizeSearchResponse,
} from "../lib/tmdb/normalize";

describe("TMDB normalization", () => {
  it("normalizes empty TV search responses with attribution", () => {
    const result = normalizeSearchResponse({
      page: 1,
      results: [],
      total_pages: 0,
      total_results: 0,
    });

    expect(result).toMatchObject({
      page: 1,
      results: [],
      totalPages: 0,
      totalResults: 0,
    });
    expect(result.attribution.notice).toContain("not endorsed or certified by TMDB");
  });

  it("normalizes TV search results and filters invalid entries", () => {
    const result = normalizeSearchResponse({
      page: 2,
      results: [
        {
          backdrop_path: "/backdrop.jpg",
          first_air_date: "2008-01-20",
          genre_ids: [18, 0, 80],
          id: 1396,
          name: "Breaking Bad",
          origin_country: ["US"],
          original_language: "en",
          original_name: "Breaking Bad",
          overview: "A chemistry teacher starts cooking.",
          popularity: 298.884,
          poster_path: "/poster.jpg",
          vote_average: 8.879,
          vote_count: 11536,
        },
        {
          id: 0,
          name: "Invalid",
        },
      ],
      total_pages: 4,
      total_results: 78,
    });

    expect(result.results).toHaveLength(1);
    expect(result.results[0]).toMatchObject({
      backdropPath: "/backdrop.jpg",
      firstAirDate: "2008-01-20",
      genreIds: [18, 80],
      originCountries: ["US"],
      posterPath: "/poster.jpg",
      title: "Breaking Bad",
      tmdbId: 1396,
    });
  });

  it("normalizes full show details with seasons and episodes", () => {
    const result = normalizeFullShowDetails(
      {
        backdrop_path: "/show-backdrop.jpg",
        episode_run_time: [45],
        first_air_date: "2011-04-17",
        genres: [{ id: 18, name: "Drama" }],
        id: 1399,
        in_production: false,
        languages: ["en"],
        last_air_date: "2019-05-19",
        name: "Game of Thrones",
        networks: [{ id: 49, logo_path: "/hbo.png", name: "HBO", origin_country: "US" }],
        number_of_episodes: 73,
        number_of_seasons: 8,
        origin_country: ["US"],
        original_language: "en",
        original_name: "Game of Thrones",
        overview: "Seven noble families fight for control.",
        popularity: 100,
        poster_path: "/show-poster.jpg",
        seasons: [
          {
            air_date: "2011-04-17",
            episode_count: 10,
            id: 3624,
            name: "Season 1",
            season_number: 1,
          },
        ],
        status: "Ended",
        vote_average: 8.5,
        vote_count: 24000,
      },
      [
        {
          air_date: "2011-04-17",
          episodes: [
            {
              air_date: "2011-04-17",
              episode_number: 1,
              episode_type: "standard",
              id: 63056,
              name: "Winter Is Coming",
              overview: "The story begins.",
              runtime: 62,
              season_number: 1,
              show_id: 1399,
              still_path: "/still.jpg",
              vote_average: 8.1,
              vote_count: 396,
            },
          ],
          id: 3624,
          name: "Season 1",
          season_number: 1,
        },
      ],
    );

    expect(result.show).toMatchObject({
      genres: [{ id: 18, name: "Drama" }],
      networks: [{ id: 49, logoPath: "/hbo.png", name: "HBO", originCountry: "US" }],
      numberOfEpisodes: 73,
      numberOfSeasons: 8,
      status: "Ended",
      title: "Game of Thrones",
      tmdbId: 1399,
    });
    expect(result.seasons).toHaveLength(1);
    expect(result.seasons[0]).toMatchObject({
      episodeCount: 1,
      name: "Season 1",
      seasonNumber: 1,
      showTmdbId: 1399,
      tmdbId: 3624,
    });
    expect(result.episodes[0]).toMatchObject({
      episodeNumber: 1,
      runtimeMinutes: 62,
      seasonNumber: 1,
      showTmdbId: 1399,
      title: "Winter Is Coming",
      tmdbId: 63056,
    });
  });
});

import { TMDB_ATTRIBUTION } from "../../../lib/tmdb/attribution";

// Deterministic public data; real Next routing and real Discover UI, no Auth/DB/TMDB.
export function listing(state) {
  const page = state.q ? state.searchPage : state.page;
  const title = state.q ? `${state.q} search page ${page}` : `${state.feed} page ${page}`;
  return {
    attribution: TMDB_ATTRIBUTION, page, totalPages: 10, totalResults: 10,
    results: [{ tmdbId: page, title, posterPath: null, firstAirDate: "2020-01-01", overview: null, voteAverage: null, voteCount: 0 }],
    ...(!state.q ? {
      feed: state.feed, source: "tmdb", fetchedAt: new Date().toISOString(), freshness: "fresh",
      pagination: { supported: true, cap: 10, next: page < 10, previous: page > 1 },
    } : {}),
  };
}

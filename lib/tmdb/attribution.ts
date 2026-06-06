export const TMDB_ATTRIBUTION = {
  sourceName: "TMDB",
  sourceUrl: "https://www.themoviedb.org",
  notice: "This product uses the TMDB API but is not endorsed or certified by TMDB.",
} as const;

export const TMDB_LOGO_PATH = "/tmdb-logo.svg";

export type TmdbAttribution = typeof TMDB_ATTRIBUTION;

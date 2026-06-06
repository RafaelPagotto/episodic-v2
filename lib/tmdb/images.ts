const TMDB_IMAGE_BASE_URL = "https://image.tmdb.org/t/p";

export type TmdbPosterSize = "w185" | "w342" | "w500";
export type TmdbBackdropSize = "w300" | "w780" | "w1280";

export function getTmdbImageUrl(path: string | null, size: TmdbPosterSize | TmdbBackdropSize = "w342") {
  if (!path) {
    return null;
  }

  return `${TMDB_IMAGE_BASE_URL}/${size}${path}`;
}

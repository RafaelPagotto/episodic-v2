import type { NormalizedTmdbSearchResult } from "@/lib/tmdb/types";

// Only public TMDB results are cached. Membership and preferences always come from page props.
const resultsCache = new Map<string, { results: NormalizedTmdbSearchResult[]; savedAt: number }>();
const MAX_CACHED_QUERIES = 8;
const CACHE_LIFETIME_MS = 5 * 60 * 1_000;

export function readSearchResults(query: string) {
  const cached = resultsCache.get(query);
  if (!cached || Date.now() - cached.savedAt >= CACHE_LIFETIME_MS) {
    resultsCache.delete(query);
    return undefined;
  }
  return cached.results;
}

export function rememberSearchResults(query: string, results: NormalizedTmdbSearchResult[]) {
  resultsCache.delete(query);
  resultsCache.set(query, { results, savedAt: Date.now() });
  while (resultsCache.size > MAX_CACHED_QUERIES) {
    resultsCache.delete(resultsCache.keys().next().value!);
  }
}

export function forgetSearchResults(query: string) {
  resultsCache.delete(query);
}

export function getSearchHref(pathname: string, search: string, query: string, hash = "") {
  const params = new URLSearchParams(search);
  if (query) params.set("q", query);
  else params.delete("q");
  const nextSearch = params.toString();
  return `${pathname}${nextSearch ? `?${nextSearch}` : ""}${hash}`;
}

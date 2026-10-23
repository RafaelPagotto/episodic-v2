import type { NormalizedTmdbSearchResponse, TmdbDiscoverFeed } from "@/lib/tmdb/types";

export const DISCOVER_FEEDS = ["trending", "popular", "top-rated"] as const;
export type DiscoverFeed = TmdbDiscoverFeed;
export type DiscoverResponse = NormalizedTmdbSearchResponse & {
  feed: DiscoverFeed | "demo";
  source: "tmdb" | "demo";
  fetchedAt: string | null;
  freshness: "fresh" | "stale" | "local";
  pagination: { supported: boolean; cap: number; next: boolean; previous: boolean };
};
export type ListingResult = { data: DiscoverResponse | NormalizedTmdbSearchResponse; error?: never } |
  { data?: never; error: { status: number; message: string; retryAfter?: number } };

import "server-only";

import { unstable_cache } from "next/cache";
import { discoverTmdbShows } from "@/lib/tmdb/server";
import { DISCOVER_PAGE_CAP, feedPolicy, listingFreshness } from "./policy";
import type { DiscoverFeed, DiscoverResponse } from "./types";

export class DiscoverUnavailableError extends Error {
  constructor() { super("Shows are unavailable right now. Please try again."); }
}

// Only public normalized TMDB data enters this cache. Auth stays at each caller.
export async function getPublicDiscoverListing(feed: DiscoverFeed, page: number): Promise<DiscoverResponse> {
  const cached = unstable_cache(async () => {
    const data = await discoverTmdbShows(feed, page);
    return { ...data, fetchedAt: new Date().toISOString() };
  }, ["discover-v1", feed, String(page), "en-US"], { revalidate: feedPolicy(feed).revalidateMs / 1000 });
  const data = await cached();
  const freshness = listingFreshness(feed, data.fetchedAt);
  if (!freshness) {
    console.warn("discover_cache_unavailable", { feed, page });
    throw new DiscoverUnavailableError();
  }
  if (freshness === "stale") console.info("discover_cache_stale", { feed, page, ageMs: Date.now() - Date.parse(data.fetchedAt) });
  const cap = Math.min(DISCOVER_PAGE_CAP, data.totalPages);
  return { ...data, feed, source: "tmdb", freshness,
    pagination: { supported: true, cap, next: page < cap, previous: page > 1 } };
}

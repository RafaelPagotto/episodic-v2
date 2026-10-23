import type { NormalizedTmdbSearchResponse } from "@/lib/tmdb/types";
import { listingFreshness } from "./policy";
import type { DiscoverFeed, DiscoverResponse } from "./types";
import { discoverKey, type DiscoverState } from "./state";

const snapshots = new Map<string, { data: NormalizedTmdbSearchResponse | DiscoverResponse; saved: number }>();
const positions = new Map<string, number>();
const feeds = new Map<DiscoverFeed, number>();
let account: string | null = null;
export function beginDiscoverVisit(scope: string) {
  if (scope !== account) { clearDiscoverVisit(); account = scope; }
}
export function clearDiscoverVisit() { snapshots.clear(); positions.clear(); feeds.clear(); account = null; }
export function rememberListing(key: string, data: NormalizedTmdbSearchResponse | DiscoverResponse, now = Date.now()) {
  if ("source" in data && data.source === "demo") return;
  snapshots.delete(key);
  snapshots.set(key, { data, saved: now });
  while (snapshots.size > 8) snapshots.delete(snapshots.keys().next().value!);
}
export function forgetListing(key: string) { snapshots.delete(key); }
export function readListing(key: string, now = Date.now()) {
  const cached = snapshots.get(key);
  if (!cached) return null;
  const { data } = cached;
  const freshness = "feed" in data && data.feed !== "demo" ? listingFreshness(data.feed, data.fetchedAt, now) : undefined;
  if (now - cached.saved >= 5 * 60_000 || freshness === null) { snapshots.delete(key); return null; }
  return freshness ? { ...data, freshness } : data;
}
export function rememberPosition(key: string, y: number) {
  positions.delete(key); positions.set(key, Math.max(0, y));
  while (positions.size > 8) positions.delete(positions.keys().next().value!);
}
export function readPosition(key: string) { return positions.get(key); }
export function rememberNavigationPosition(current: DiscoverState, next: DiscoverState, demo: boolean, y: number) {
  rememberPosition(discoverKey(current, demo), y);
  // Explicit feed switches keep the tab strip in place, not an old feed offset.
  if (!current.q && !next.q && current.feed !== next.feed) {
    rememberPosition(discoverKey(next, demo), y);
  }
}
export function rememberFeedPage(feed: DiscoverFeed, page: number) { feeds.set(feed, page); }
export function readFeedPage(feed: DiscoverFeed) { return feeds.get(feed) ?? 1; }

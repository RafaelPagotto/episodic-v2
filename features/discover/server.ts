import "server-only";

import type { User } from "@supabase/supabase-js";
import { searchDemoCatalogue } from "@/features/guest/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isTmdbClientError } from "@/lib/tmdb/errors";
import { consumeTmdbRateLimit } from "@/lib/tmdb/rate-limit";
import { searchTmdbShows } from "@/lib/tmdb/server";
import { getPublicDiscoverListing } from "./data";
import type { DiscoverFeed, ListingResult } from "./types";

export function listingError(error: unknown, context?: { feed: DiscoverFeed | "demo"; page: number; durationMs: number }): ListingResult {
  const limited = isTmdbClientError(error) && error.status === 429;
  console.error("discover_unavailable", { code: limited ? "RATE_LIMITED" : "UNAVAILABLE", ...context });
  const retry = limited ? Number(error.retryAfter) : NaN;
  return { error: { status: limited ? 429 : 503,
    message: limited ? "Too many requests. Please try again shortly." : "Shows are unavailable right now. Please try again.",
    ...(Number.isFinite(retry) && retry > 0 ? { retryAfter: Math.ceil(retry) } : {}) } };
}

// Callers must obtain this user through the trusted Auth/guest-readiness check.
export async function loadDiscoverListing(user: User, feed: DiscoverFeed | "demo", page: number): Promise<ListingResult> {
  const started = Date.now();
  if (user.is_anonymous && feed !== "demo") return { error: { status: 403, message: "Demo accounts can browse Demo Picks only." } };
  if (!user.is_anonymous && feed === "demo") return { error: { status: 400, message: "Choose a discovery collection." } };
  const limit = consumeTmdbRateLimit("discover", user.id);
  if (!limit.allowed) return { error: { status: 429, message: "Too many requests. Please try again shortly.", retryAfter: limit.retryAfterSeconds } };
  try {
    if (user.is_anonymous) {
      const data = await searchDemoCatalogue(await createSupabaseServerClient(), "", 1);
      return { data: { ...data, feed: "demo", source: "demo", fetchedAt: null, freshness: "local",
        pagination: { supported: false, cap: 1, next: false, previous: false } } };
    }
    return { data: await getPublicDiscoverListing(feed as DiscoverFeed, page) };
  } catch (error) { return listingError(error, { feed, page, durationMs: Date.now() - started }); }
}

export async function loadDiscoverSearch(user: User, query: string, page: number): Promise<ListingResult> {
  const limit = consumeTmdbRateLimit("search", user.id);
  if (!limit.allowed) return { error: { status: 429, message: "Too many requests. Please try again shortly.", retryAfter: limit.retryAfterSeconds } };
  try {
    return { data: user.is_anonymous ? await searchDemoCatalogue(await createSupabaseServerClient(), query, 1) :
      await searchTmdbShows({ query, page, language: "en-US" }) };
  } catch (error) { return listingError(error); }
}

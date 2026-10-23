import { DISCOVER_FEEDS, type DiscoverFeed } from "./types";

const HOUR = 60 * 60 * 1000;
export const DISCOVER_PAGE_CAP = 10;
export function isDiscoverFeed(value: unknown): value is DiscoverFeed {
  return DISCOVER_FEEDS.some((feed) => feed === value);
}
export function feedPolicy(feed: DiscoverFeed) {
  return feed === "top-rated" ? { revalidateMs: 24 * HOUR, maxAgeMs: 72 * HOUR } :
    { revalidateMs: 6 * HOUR, maxAgeMs: 24 * HOUR };
}
export function listingFreshness(feed: DiscoverFeed, fetchedAt: string | null, now = Date.now()) {
  const stamp = fetchedAt === null ? NaN : Date.parse(fetchedAt);
  const age = now - stamp;
  if (!Number.isFinite(age) || age < 0 || age >= feedPolicy(feed).maxAgeMs) return null;
  return age >= feedPolicy(feed).revalidateMs ? "stale" as const : "fresh" as const;
}
export function readDiscoverParams(params: URLSearchParams) {
  for (const key of ["feed", "page", "language"]) if (params.getAll(key).length > 1) return null;
  // A fixed contract prevents arbitrary upstream filters or paths.
  if ([...params.keys()].some((key) => !["feed", "page", "language"].includes(key))) return null;
  const feed = params.get("feed") ?? "trending";
  const rawPage = params.get("page") ?? "1";
  const page = Number(rawPage);
  if ((!isDiscoverFeed(feed) && feed !== "demo") || !/^[1-9]\d*$/.test(rawPage) ||
      !Number.isSafeInteger(page) || page > (feed === "demo" ? 1 : DISCOVER_PAGE_CAP) ||
      (params.get("language") ?? "en-US") !== "en-US") return null;
  return { feed: feed as DiscoverFeed | "demo", page };
}

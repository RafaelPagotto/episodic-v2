import { beforeEach, describe, expect, it } from "vitest";
import { discoverHref, discoverKey, discoverRequest, parseDiscoverState } from "../features/discover/state";
import { listingFreshness, readDiscoverParams } from "../features/discover/policy";
import { beginDiscoverVisit, clearDiscoverVisit, readFeedPage, readListing, readPosition, rememberFeedPage, rememberListing, rememberNavigationPosition, rememberPosition } from "../features/discover/session";
import { TMDB_ATTRIBUTION } from "../lib/tmdb/attribution";

const now = Date.parse("2026-10-22T12:00:00Z");
const hour = 3600_000;
const envelope = { attribution: TMDB_ATTRIBUTION, page: 1, results: [], totalPages: 10, totalResults: 200 };
describe("Discover date/cache policy", () => {
  it.each(["trending", "popular", "top-rated"] as const)("enforces exact freshness/max-age boundaries for %s", (feed) => {
    const revalidate = feed === "top-rated" ? 24 : 6;
    const max = feed === "top-rated" ? 72 : 24;
    expect(listingFreshness(feed, new Date(now - revalidate * hour + 1).toISOString(), now)).toBe("fresh");
    expect(listingFreshness(feed, new Date(now - revalidate * hour).toISOString(), now)).toBe("stale");
    expect(listingFreshness(feed, new Date(now - max * hour + 1).toISOString(), now)).toBe("stale");
    expect(listingFreshness(feed, new Date(now - max * hour).toISOString(), now)).toBeNull();
    for (const stamp of [null, "invalid", new Date(now + 1).toISOString()]) expect(listingFreshness(feed, stamp, now)).toBeNull();
  });
});
describe("Discover navigation", () => {
  it("restores independent browse and search pages from a direct URL", () => {
    const state = parseDiscoverState(new URLSearchParams("feed=popular&page=3&q=+dark+&searchPage=2"));
    expect(state).toEqual({ feed: "popular", page: 3, q: "dark", searchPage: 2 });
    expect(discoverHref({ ...state, q: "", searchPage: 1 })).toBe("/discover?feed=popular&page=3");
    expect(discoverRequest(state, false)).toContain("query=dark&page=2");
  });
  it("normalizes invalid URLs and omits defaults without loops", () => {
    const state = parseDiscoverState(new URLSearchParams("feed=bad&page=11&searchPage=501&q=x"));
    expect(discoverHref(state)).toBe("/discover?q=x");
    expect(discoverHref(parseDiscoverState(new URLSearchParams(discoverHref(state).split("?")[1])))).toBe(discoverHref(state));
    expect(discoverHref(parseDiscoverState(new URLSearchParams("q=%20")))).toBe("/discover");
    expect(parseDiscoverState(new URLSearchParams({ q: "x".repeat(101) })).q).toBe("");
  });
  it("canonicalizes guest browsing without losing a valid search", () => {
    const state = parseDiscoverState(new URLSearchParams("feed=popular&page=3&q=dark&searchPage=2"), true);
    expect(discoverHref(state)).toBe("/discover?q=dark");
    expect(discoverRequest({ ...state, q: "" }, true)).toContain("feed=demo&page=1");
  });
  it("keeps feed/query/page resource keys distinct", () => {
    const state = parseDiscoverState(new URLSearchParams());
    expect(new Set([state, { ...state, page: 2 }, { ...state, feed: "popular" as const }, { ...state, q: "dark" }, { ...state, q: "dark", searchPage: 2 }].map((s) => discoverKey(s, false))).size).toBe(5);
  });
});
describe("Discover API parameters", () => {
  it.each(["feed=nope", "page=0", "page=11", "page=1.0", "page=1e1", "page=-1", "page=01", "page=NaN", "feed=demo&page=2", "language=fr-FR", "page=1&page=2", "feed=popular&feed=popular", "language=en-US&language=en-US", "include_adult=true", "path=/tv"])("rejects %s", (query) => {
    expect(readDiscoverParams(new URLSearchParams(query))).toBeNull();
  });
  it("accepts the bounded allowlist", () => {
    expect(readDiscoverParams(new URLSearchParams("feed=top-rated&page=10"))).toEqual({ feed: "top-rated", page: 10 });
    expect(readDiscoverParams(new URLSearchParams("feed=demo"))).toEqual({ feed: "demo", page: 1 });
  });
});
describe("bounded visit memory", () => {
  beforeEach(() => clearDiscoverVisit());
  it.each(["trending", "popular", "top-rated"] as const)("keeps the viewport on an explicit switch to %s instead of restoring its old offset", (feed) => {
    const current = { feed: feed === "trending" ? "popular" as const : "trending" as const, page: 1, q: "", searchPage: 1 };
    const next = { ...current, feed, page: 3 };
    rememberFeedPage(feed, 3);
    rememberPosition(discoverKey(next, false), 950);
    rememberNavigationPosition(current, next, false, 0);
    expect(readPosition(discoverKey(next, false))).toBe(0);
    expect(readFeedPage(feed)).toBe(3);
    rememberNavigationPosition(current, next, false, 40);
    expect(readPosition(discoverKey(current, false))).toBe(40);
    expect(readPosition(discoverKey(next, false))).toBe(40);
  });
  it("keeps pagination and search position restoration independent of tab switches", () => {
    const current = { feed: "popular" as const, page: 1, q: "", searchPage: 1 };
    for (const next of [{ ...current, page: 2 }, { ...current, q: "dark" }]) {
      const target = discoverKey(next, false);
      rememberPosition(target, 320);
      rememberNavigationPosition(current, next, false, 900);
      expect(readPosition(target)).toBe(320);
      expect(readPosition(discoverKey(current, false))).toBe(900);
    }
  });
  it("retains eight public snapshots for strictly less than five minutes", () => {
    for (let i = 0; i < 9; i++) rememberListing(String(i), envelope, now);
    expect(readListing("0", now)).toBeNull();
    expect(readListing("8", now + 299_999)).not.toBeNull();
    expect(readListing("8", now + 300_000)).toBeNull();
  });
  it("rechecks maximum served age even for a recent browser snapshot", () => {
    rememberListing("feed", { ...envelope, feed: "popular", source: "tmdb", fetchedAt: new Date(now - 24 * hour + 1).toISOString(), freshness: "stale", pagination: { cap: 10, next: true, previous: false, supported: true } }, now);
    expect(readListing("feed", now)).not.toBeNull();
    expect(readListing("feed", now + 1)).toBeNull();
  });
  it("never stores demo rows and clears account-scoped position/feed state", () => {
    beginDiscoverVisit("first");
    rememberListing("demo", { ...envelope, feed: "demo", source: "demo", fetchedAt: null, freshness: "local", pagination: { cap: 1, next: false, previous: false, supported: false } }, now);
    expect(readListing("demo", now)).toBeNull();
    rememberPosition("x", 900); rememberFeedPage("popular", 3);
    beginDiscoverVisit("first"); expect(readPosition("x")).toBe(900); expect(readFeedPage("popular")).toBe(3);
    beginDiscoverVisit("reset-or-another-account"); expect(readPosition("x")).toBeUndefined(); expect(readFeedPage("popular")).toBe(1);
  });
});

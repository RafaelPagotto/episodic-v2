import type { User } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ getUser: vi.fn(), demo: vi.fn(), client: {}, limit: vi.fn(), cached: vi.fn(), search: vi.fn(), discover: vi.fn(), cacheCalls: [] as unknown[][] }));
vi.mock("server-only", () => ({}));
vi.mock("@/features/discover/policy", async () => import("../features/discover/policy"));
vi.mock("@/features/discover/server", async () => import("../features/discover/server"));
vi.mock("@/lib/tmdb/errors", async () => import("../lib/tmdb/errors"));
vi.mock("@/features/auth/session", () => ({ getCurrentUser: mocks.getUser }));
vi.mock("@/features/guest/server", () => ({ searchDemoCatalogue: mocks.demo }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => mocks.client }));
vi.mock("@/lib/tmdb/rate-limit", () => ({ consumeTmdbRateLimit: mocks.limit }));
vi.mock("@/lib/tmdb/server", () => ({ discoverTmdbShows: mocks.discover, searchTmdbShows: mocks.search }));
vi.mock("next/cache", () => ({ unstable_cache: (fn: () => unknown, keys: unknown[], options: unknown) => {
  mocks.cacheCalls.push([keys, options]); return () => mocks.cached(fn);
} }));
import { GET } from "../app/api/tmdb/discover/route";
import { getPublicDiscoverListing } from "../features/discover/data";
import { loadDiscoverSearch } from "../features/discover/server";
import { TmdbClientError } from "../lib/tmdb/errors";
import { TMDB_ATTRIBUTION } from "../lib/tmdb/attribution";
const permanent = { id: "private-user", is_anonymous: false, user_metadata: { is_anonymous: true } } as unknown as User;
const guest = { ...permanent, is_anonymous: true } as User;
const data = { attribution: TMDB_ATTRIBUTION, results: [], page: 1, totalPages: 500, totalResults: 10000 };
function request(params = "") { return GET(new NextRequest(`http://localhost/api/tmdb/discover?${params}`)); }
beforeEach(() => {
  vi.resetAllMocks(); mocks.cacheCalls.length = 0;
  mocks.getUser.mockResolvedValue(permanent); mocks.limit.mockReturnValue({ allowed: true });
  mocks.discover.mockResolvedValue(data); mocks.demo.mockResolvedValue(data); mocks.search.mockResolvedValue(data);
  mocks.cached.mockImplementation((fn: () => unknown) => fn());
  vi.spyOn(console, "error").mockImplementation(() => {});
});
describe("authenticated Discover API", () => {
  it.each([null, undefined])("denies absent/expired/unregistered users before cache access", async (user) => {
    mocks.getUser.mockResolvedValue(user);
    const response = await request();
    expect(response.status).toBe(401); expect(mocks.cached).not.toHaveBeenCalled(); expect(mocks.discover).not.toHaveBeenCalled();
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });
  it("fails closed if authentication cannot be verified", async () => {
    mocks.getUser.mockRejectedValue(new Error("private internal error"));
    expect((await request()).status).toBe(401); expect(mocks.discover).not.toHaveBeenCalled();
  });
  it("denies global feeds to guests regardless of forged metadata", async () => {
    mocks.getUser.mockResolvedValue({ ...guest, user_metadata: { is_anonymous: false } });
    const response = await request("feed=popular");
    expect(response.status).toBe(403); expect(mocks.cached).not.toHaveBeenCalled(); expect(mocks.discover).not.toHaveBeenCalled();
  });
  it("rejects malformed requests before cache and upstream access", async () => {
    for (const params of ["page=11", "feed=trending&feed=popular", "language=de-DE", "page=2&page=2", "include_adult=true"]) expect((await request(params)).status).toBe(400);
    expect(mocks.discover).not.toHaveBeenCalled(); expect(mocks.cached).not.toHaveBeenCalled();
  });
  it("uses trusted identity and public-only cache keys, capped pagination and private responses", async () => {
    const response = await request("feed=popular&page=10");
    expect(response.status).toBe(200); expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(mocks.limit).toHaveBeenCalledWith("discover", permanent.id);
    expect(mocks.discover).toHaveBeenCalledWith("popular", 10);
    expect(mocks.cacheCalls).toEqual([[["discover-v1", "popular", "10", "en-US"], { revalidate: 21600 }]]);
    expect(await response.json()).toMatchObject({ feed: "popular", source: "tmdb", freshness: "fresh", totalPages: 500, pagination: { cap: 10, next: false, previous: true } });
  });
  it("serves guest cached catalogue without TMDB calls or shared-cache access", async () => {
    mocks.getUser.mockResolvedValue(guest);
    const response = await request("feed=demo");
    expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ source: "demo", freshness: "local", fetchedAt: null, pagination: { supported: false } });
    expect(mocks.demo).toHaveBeenCalledWith(mocks.client, "", 1);
    await loadDiscoverSearch(guest, "Fallout", 1);
    expect(mocks.demo).toHaveBeenLastCalledWith(mocks.client, "Fallout", 1);
    expect(mocks.search).not.toHaveBeenCalled(); expect(mocks.discover).not.toHaveBeenCalled(); expect(mocks.cached).not.toHaveBeenCalled();
  });
  it("does not fall back to global TMDB feeds if the guest catalogue fails", async () => {
    mocks.getUser.mockResolvedValue(guest); mocks.demo.mockRejectedValue(new Error("secret"));
    const response = await request("feed=demo");
    expect(response.status).toBe(503); expect(JSON.stringify(await response.json())).not.toContain("secret");
    expect(mocks.discover).not.toHaveBeenCalled();
  });
  it("uses a separate limiter and honors local and upstream Retry-After", async () => {
    mocks.limit.mockReturnValueOnce({ allowed: false, retryAfterSeconds: 20 });
    let response = await request();
    expect(response.status).toBe(429); expect(response.headers.get("Retry-After")).toBe("20"); expect(mocks.discover).not.toHaveBeenCalled();
    mocks.discover.mockRejectedValueOnce(new TmdbClientError({ code: "TMDB_RATE_LIMITED", message: "private", status: 429, retryAfter: "17" }));
    response = await request(); expect(response.status).toBe(429); expect(response.headers.get("Retry-After")).toBe("17");
    expect(JSON.stringify(await response.json())).not.toContain("private");
  });
  it("returns controlled errors for cold failures without caching a fabricated success", async () => {
    mocks.discover.mockRejectedValue(new Error("TMDB_API_KEY=secret"));
    const response = await request();
    expect(response.status).toBe(503); expect(await response.json()).toMatchObject({ error: { message: "Shows are unavailable right now. Please try again." } });
    expect(mocks.discover).toHaveBeenCalledTimes(1);
  });
});
describe("shared listing cache age enforcement", () => {
  it("uses upstream totals below the ten-page cap, including sparse/empty pages", async () => {
    mocks.cached.mockResolvedValue({ ...data, page: 2, totalPages: 2, fetchedAt: new Date().toISOString() });
    expect((await getPublicDiscoverListing("popular", 2)).pagination).toEqual({ cap: 2, next: false, previous: true, supported: true });
  });
  it("checks age after every cache hit, without advancing fetchedAt", async () => {
    const fetchedAt = new Date(Date.now() - 6 * 3600_000).toISOString();
    mocks.cached.mockResolvedValue({ ...data, fetchedAt });
    const response = await getPublicDiscoverListing("popular", 1);
    expect(response).toMatchObject({ fetchedAt, freshness: "stale" });
    expect(mocks.discover).not.toHaveBeenCalled();
  });
  it.each(["invalid", new Date(0).toISOString()])("rejects over-age/unusable cached timestamp %s", async (fetchedAt) => {
    mocks.cached.mockResolvedValue({ ...data, fetchedAt });
    await expect(getPublicDiscoverListing("popular", 1)).rejects.toThrow("unavailable");
  });
});

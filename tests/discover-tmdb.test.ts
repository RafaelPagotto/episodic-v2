import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { discoverTmdbShows } from "../lib/tmdb/server";
const fetchMock = vi.fn();
beforeEach(() => { vi.stubEnv("TMDB_API_KEY", "fixture-not-a-real-key"); vi.stubGlobal("fetch", fetchMock); fetchMock.mockReset(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe("read-only TMDB listing adapter", () => {
  it.each([["trending", "/3/trending/tv/week"], ["popular", "/3/tv/popular"], ["top-rated", "/3/tv/top_rated"]] as const)("maps %s to its allowlisted endpoint with explicit paging", async (feed, path) => {
    fetchMock.mockResolvedValue(Response.json({ page: 2, total_pages: 500, total_results: 10000, results: [{ id: 1, name: "Test" }] }));
    expect((await discoverTmdbShows(feed, 2)).page).toBe(2);
    const [url, options] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toBe(path); expect(url.searchParams.get("page")).toBe("2"); expect(url.searchParams.get("language")).toBe("en-US");
    expect(options.cache).toBe("no-store"); expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("deduplicates stably, removes explicit adult/invalid results, and limits one page to twenty without refilling", async () => {
    const results = [{ id: 0, name: "bad" }, { id: 1, name: "adult", adult: true }, { id: 2, name: "first" }, { id: 2, name: "duplicate" }, ...Array.from({ length: 25 }, (_, i) => ({ id: i + 3, name: `Show ${i}` }))];
    fetchMock.mockResolvedValue(Response.json({ page: 1, total_pages: 100, total_results: 2000, results }));
    const response = await discoverTmdbShows("trending", 1);
    expect(response.results).toHaveLength(20); expect(response.results[0].title).toBe("first"); expect(response.results[1].tmdbId).toBe(3);
    expect(response.totalResults).toBe(2000); expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("never silently presents Trending page one as page two", async () => {
    fetchMock.mockResolvedValue(Response.json({ page: 1, total_pages: 500, total_results: 10000, results: [] }));
    await expect(discoverTmdbShows("trending", 2)).rejects.toThrow("Listing unavailable");
  });
  it.each([null, {}, { page: 1, results: null }, { page: 1, results: [], total_pages: -1, total_results: 1 }])("rejects malformed upstream envelope", async (data) => {
    fetchMock.mockResolvedValue(Response.json(data));
    await expect(discoverTmdbShows("popular", 1)).rejects.toThrow();
  });
  it("does not retry upstream 429 or failures", async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValue(new Response(null, { status: 429, headers: { "Retry-After": "30" } }));
    await expect(discoverTmdbShows("popular", 1)).rejects.toMatchObject({ status: 429, retryAfter: "30" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await expect(discoverTmdbShows("top-rated", 1)).rejects.toMatchObject({ status: 429, retryAfter: "30" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(30_000);
    fetchMock.mockResolvedValue(Response.json({ page: 1, total_pages: 1, total_results: 0, results: [] }));
    await discoverTmdbShows("popular", 1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

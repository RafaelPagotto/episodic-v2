import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TmdbClientError } from "../lib/tmdb/errors";
import { createScheduledTmdbRequestControl } from "../lib/tmdb/scheduled-requests";
import { getFullTmdbShowDetails, getTmdbShowDetails } from "../lib/tmdb/server";

vi.mock("server-only", () => ({}));
const now = Date.parse("2026-10-05T12:00:00Z");
function limited(retryAfter = "2") {
  return new TmdbClientError({ code: "TMDB_RATE_LIMITED", message: "Limited", status: 429, retryAfter });
}
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(now); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("cron-scoped TMDB request controls", () => {
  it("fetches credits and ratings in the existing show details request", async () => {
    vi.stubEnv("TMDB_API_KEY", "test-key");
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      expect(url.pathname).toBe("/3/tv/42");
      expect(url.searchParams.get("append_to_response")).toBe("aggregate_credits,content_ratings");
      return Response.json({ id: 42, name: "Show", created_by: [{ id: 1, name: "Creator" }] });
    });
    vi.stubGlobal("fetch", fetchMock);
    expect(await getTmdbShowDetails(42)).toMatchObject({ created_by: [{ id: 1, name: "Creator" }] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("paces starts at 100ms apart, preserving concurrent in-flight requests", async () => {
    const control = createScheduledTmdbRequestControl(now + 240000);
    const starts: number[] = [];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const tasks = Array.from({ length: 5 }, () => control.run(async (signal) => {
      expect(signal).toBeInstanceOf(AbortSignal);
      starts.push(Date.now());
      await gate;
    }));
    await vi.advanceTimersByTimeAsync(400);
    expect(starts).toEqual([0, 100, 200, 300, 400].map((ms) => now + ms));
    release();
    await Promise.all(tasks);
    expect(control.metrics()).toEqual({ requests: 5, retries: 0 });
  });
  it.each(["2", new Date(now + 2000).toUTCString()])("honors Retry-After %s and shares cooldown with later requests", async (retryAfter) => {
    const control = createScheduledTmdbRequestControl(now + 240000);
    const operation = vi.fn().mockRejectedValueOnce(limited(retryAfter)).mockResolvedValue("ok");
    const first = control.run(operation);
    await vi.advanceTimersByTimeAsync(0);
    const other = vi.fn().mockResolvedValue("other");
    const second = control.run(other);
    await vi.advanceTimersByTimeAsync(1999);
    expect(operation).toHaveBeenCalledTimes(1);
    expect(other).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(101);
    expect(await first).toBe("ok");
    expect(await second).toBe("other");
    expect(control.metrics()).toEqual({ requests: 3, retries: 1 });
  });
  it("retries at most once and preserves cooldown after the second 429", async () => {
    const control = createScheduledTmdbRequestControl(now + 240000);
    const operation = vi.fn().mockRejectedValue(limited("1"));
    const result = control.run(operation).catch((error) => error);
    await vi.advanceTimersByTimeAsync(1000);
    expect(await result).toBeInstanceOf(TmdbClientError);
    expect(operation).toHaveBeenCalledTimes(2);
    const other = vi.fn().mockResolvedValue("ok");
    const pending = control.run(other);
    await vi.advanceTimersByTimeAsync(999);
    expect(other).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await pending;
  });
  it("does not retry other errors or wait beyond the invocation deadline", async () => {
    const control = createScheduledTmdbRequestControl(now + 240000);
    const fail = vi.fn().mockRejectedValue(new Error("network error"));
    await expect(control.run(fail)).rejects.toThrow("network error");
    expect(fail).toHaveBeenCalledTimes(1);
    const limitedOperation = vi.fn().mockRejectedValue(limited("300"));
    const failure = control.run(limitedOperation).catch((error) => error);
    await vi.advanceTimersByTimeAsync(100);
    expect(await failure).toMatchObject({ message: "Metadata refresh time budget exhausted." });
    expect(limitedOperation).toHaveBeenCalledTimes(1);
  });
  it("sets request and database timeouts and rejects expired writes", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    const control = createScheduledTmdbRequestControl(now + 240000);
    await control.run(async () => "ok");
    control.databaseSignal();
    expect(timeout.mock.calls).toEqual([[15000], [10000]]);
    vi.setSystemTime(now + 239000);
    control.databaseSignal();
    expect(timeout).toHaveBeenLastCalledWith(1000);
    vi.setSystemTime(now + 240000);
    expect(() => control.databaseSignal()).toThrow("time budget");
  });
});

describe("TMDB transport integration", () => {
  it("aborts a stalled cron request and returns a safe error without retrying", async () => {
    vi.stubEnv("TMDB_API_KEY", "private-test-key");
    vi.spyOn(AbortSignal, "timeout").mockImplementation((ms) => {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), ms);
      return controller.signal;
    });
    const fetchMock = vi.fn((_url: URL, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init.signal!.addEventListener("abort", () => reject(new Error("private transport payload")));
    }));
    vi.stubGlobal("fetch", fetchMock);
    const pending = getTmdbShowDetails(42, { requestControl: createScheduledTmdbRequestControl(now + 240000) })
      .catch((error) => error);
    await vi.advanceTimersByTimeAsync(15000);
    expect(await pending).toMatchObject({ code: "TMDB_NETWORK_ERROR", message: "Unable to reach TMDB." });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("retries 429 through the transport without leaking credentials in errors", async () => {
    vi.stubEnv("TMDB_API_KEY", "private-test-key");
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response("private body", { status: 429, headers: { "Retry-After": "1" } }))
      .mockResolvedValueOnce(Response.json({ id: 42, name: "Show", seasons: [] }));
    vi.stubGlobal("fetch", fetchMock);
    const pending = getTmdbShowDetails(42, { requestControl: createScheduledTmdbRequestControl(now + 240000) });
    await vi.advanceTimersByTimeAsync(1000);
    expect(await pending).toMatchObject({ id: 42 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
    fetchMock.mockRejectedValue(new Error("private-test-key"));
    await expect(getTmdbShowDetails(42)).rejects.toMatchObject({ message: "Unable to reach TMDB." });
  });
  it("keeps full import/manual fetching comprehensive and free of cron controls", async () => {
    vi.stubEnv("TMDB_API_KEY", "private-test-key");
    const paths: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: URL, init: RequestInit) => {
      paths.push(url.pathname);
      expect(init.signal).toBeUndefined();
      const number = Number(url.pathname.split("/").at(-1));
      return Response.json(url.pathname === "/3/tv/42"
        ? { id: 42, name: "Show", seasons: Array.from({ length: 6 }, (_, season_number) => ({ id: 100 + season_number, season_number })) }
        : { id: 100 + number, season_number: number, episodes: [] });
    }));
    const full = await getFullTmdbShowDetails(42);
    expect(full.seasons).toHaveLength(6);
    expect(paths).toEqual(["/3/tv/42", ...Array.from({ length: 6 }, (_, number) => `/3/tv/42/season/${number}`)]);
  });
});

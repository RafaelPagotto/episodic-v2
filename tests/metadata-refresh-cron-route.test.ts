import { NextRequest, NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "../app/api/cron/refresh-metadata/route";
import { middleware } from "../middleware";
import { TmdbClientError } from "../lib/tmdb/errors";

vi.mock("server-only", () => ({}));

const selectCandidates = vi.hoisted(() => vi.fn());
const refreshMetadata = vi.hoisted(() => vi.fn());
const beginRefresh = vi.hoisted(() => vi.fn());
const cancelRefresh = vi.hoisted(() => vi.fn());
const createMetadataClient = vi.hoisted(() => vi.fn());
const updateSession = vi.hoisted(() => vi.fn());
const consumeUserRateLimit = vi.hoisted(() => vi.fn());
const createUserClient = vi.hoisted(() => vi.fn());

vi.mock("@/features/shows/metadata-refresh-candidates", () => ({ getMetadataRefreshCandidates: selectCandidates }));
vi.mock("@/features/shows/scheduled-metadata-refresh", () => ({ refreshScheduledTmdbShowMetadata: refreshMetadata }));
vi.mock("@/features/shows/metadata-refresh-retry", () => ({ beginScheduledMetadataRefresh: beginRefresh }));
vi.mock("@/lib/supabase/admin", () => ({ createOptionalSupabaseServiceRoleClient: createMetadataClient }));
vi.mock("@/lib/supabase/middleware", () => ({ updateSupabaseSession: updateSession }));
vi.mock("@/lib/tmdb/rate-limit", () => ({ consumeTmdbRateLimit: consumeUserRateLimit }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: createUserClient }));
vi.mock("@/lib/tmdb/scheduled-requests", () => import("../lib/tmdb/scheduled-requests"));
vi.mock("@/lib/tmdb/errors", () => import("../lib/tmdb/errors"));
vi.mock("@/lib/tmdb/server", () => import("../lib/tmdb/server"));

const SECRET = "test-cron-secret";
const metadataClient = {
  from: vi.fn(() => { throw new Error("Route must delegate database access to shared services."); }),
};

function request(query = "", authorization: string | null = `Bearer ${SECRET}`) {
  return new NextRequest(`https://episodic.example/api/cron/refresh-metadata${query}`, {
    headers: authorization === null ? {} : { Authorization: authorization },
  });
}

function candidates(...ids: number[]) {
  return ids.map((tmdbId) => ({ tmdbId, lastSyncedAt: null, tmdbStatus: "Returning Series", metadata: {} }));
}

function expectNoWork() {
  expect(createMetadataClient).not.toHaveBeenCalled();
  expect(selectCandidates).not.toHaveBeenCalled();
  expect(refreshMetadata).not.toHaveBeenCalled();
  expect(beginRefresh).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("CRON_SECRET", SECRET);
  vi.stubEnv("TMDB_API_KEY", "test-key");
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  createMetadataClient.mockReturnValue(metadataClient);
  selectCandidates.mockResolvedValue(candidates(20, 10, 30));
  refreshMetadata.mockResolvedValue({ title: "Not included in response" });
  beginRefresh.mockResolvedValue(cancelRefresh);
  cancelRefresh.mockResolvedValue(undefined);
  updateSession.mockResolvedValue(NextResponse.next());
});

afterEach(() => {
  expect(consumeUserRateLimit).not.toHaveBeenCalled();
  expect(createUserClient).not.toHaveBeenCalled();
  expect(metadataClient.from).not.toHaveBeenCalled();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("metadata refresh cron route", () => {
  it.each(["", "?dryRun=1"])("rejects missing and incorrect authorization for %s", async (query) => {
    for (const authorization of [null, "", "Basic test-cron-secret", SECRET, "bearer test-cron-secret", "Bearer wrong", `Bearer  ${SECRET}`, `Bearer ${SECRET} extra`]) {
      const response = await GET(request(query, authorization));
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ ok: false, error: { message: "Unauthorized." } });
      expect(response.headers.get("Cache-Control")).toBe("no-store");
    }
    expectNoWork();
    expect(console.info).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
  });

  it.each([undefined, ""])("fails safely when CRON_SECRET is %s", async (secret) => {
    vi.stubEnv("CRON_SECRET", secret);
    const response = await GET(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false, error: { message: "Metadata refresh is not configured." } });
    expectNoWork();
  });

  it.each([undefined, "", "your-tmdb-api-key"])("rejects unconfigured TMDB key %s before reservations or database work", async (key) => {
    vi.stubEnv("TMDB_API_KEY", key);
    const response = await GET(request());
    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ ok: false, error: { message: "Metadata refresh is not configured." } });
    expectNoWork();
    // Restoring configuration must allow the next invocation immediately.
    vi.stubEnv("TMDB_API_KEY", "restored-key");
    expect((await GET(request())).status).toBe(200);
    expect(beginRefresh).toHaveBeenCalledTimes(3);
  });

  it("keeps dry runs read-only and available without a TMDB key", async () => {
    vi.stubEnv("TMDB_API_KEY", "");
    const response = await GET(request("?dryRun=1"));
    expect(response.status).toBe(200);
    expect(beginRefresh).not.toHaveBeenCalled();
    expect(refreshMetadata).not.toHaveBeenCalled();
  });

  it.each(["TMDB_AUTH_ERROR", "TMDB_NOT_CONFIGURED"] as const)("releases the reservation and stops the batch for global failure %s", async (code) => {
    refreshMetadata.mockRejectedValueOnce(new TmdbClientError({ code, message: "private API key details", status: 503 }));
    const response = await GET(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false, error: { message: "Metadata refresh is unavailable. Check TMDB configuration." } });
    expect(cancelRefresh).toHaveBeenCalledOnce();
    expect(beginRefresh).toHaveBeenCalledOnce();
    expect(refreshMetadata).toHaveBeenCalledOnce();
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("private API key details");
  });

  it("stops safely even if releasing a global-failure reservation fails", async () => {
    refreshMetadata.mockRejectedValueOnce(new TmdbClientError({ code: "TMDB_AUTH_ERROR", message: "private TMDB error", status: 503 }));
    cancelRefresh.mockRejectedValueOnce(new Error("private database error"));
    const response = await GET(request());
    expect(response.status).toBe(503);
    expect(beginRefresh).toHaveBeenCalledOnce();
    expect(refreshMetadata).toHaveBeenCalledOnce();
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toMatch(/private database error|private TMDB error/);
  });

  it("uses the service-role client, selector default batch, and selected order", async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(createMetadataClient).toHaveBeenCalledTimes(1);
    const control = refreshMetadata.mock.calls[0][2];
    expect(selectCandidates.mock.calls).toEqual([[metadataClient, { control }]]);
    expect(beginRefresh.mock.calls).toEqual(candidates(20, 10, 30).map((candidate) => [candidate, metadataClient, control]));
    for (let index = 0; index < 3; index++) {
      expect(beginRefresh.mock.invocationCallOrder[index]).toBeLessThan(refreshMetadata.mock.invocationCallOrder[index]);
    }
    expect(control).toEqual(expect.objectContaining({ run: expect.any(Function), checkTime: expect.any(Function) }));
    expect(refreshMetadata.mock.calls).toEqual([[20, metadataClient, control], [10, metadataClient, control], [30, metadataClient, control]]);
    expect(await response.json()).toEqual({
      ok: true, considered: 3, refreshed: 3, failed: 0,
      results: [20, 10, 30].map((tmdbId) => ({ tmdbId, status: "refreshed" })),
    });
  });

  it("awaits each refresh before starting the next", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    refreshMetadata.mockImplementationOnce(async () => { await gate; });
    const pendingResponse = GET(request());
    await vi.waitFor(() => expect(refreshMetadata).toHaveBeenCalledTimes(1));
    expect(refreshMetadata).toHaveBeenCalledWith(20, metadataClient, expect.any(Object));
    release();
    const response = await pendingResponse;
    expect(refreshMetadata.mock.calls.map(([id]) => id)).toEqual([20, 10, 30]);
    expect((await response.json()).refreshed).toBe(3);
  });

  it("continues after individual failures and does not expose errors or service payloads", async () => {
    refreshMetadata.mockRejectedValueOnce(new Error(`private-upstream-error ${SECRET}`));
    refreshMetadata.mockResolvedValueOnce({ user_id: "private-user", token: "private-token", title: "private-title" });
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true, considered: 3, refreshed: 2, failed: 1,
      results: [
        { tmdbId: 20, status: "failed" },
        { tmdbId: 10, status: "refreshed" },
        { tmdbId: 30, status: "refreshed" },
      ],
    });
    expect(refreshMetadata).toHaveBeenCalledTimes(3);
    expect(cancelRefresh).not.toHaveBeenCalled();
    const logs = JSON.stringify([vi.mocked(console.info).mock.calls, vi.mocked(console.error).mock.calls]);
    for (const privateValue of [SECRET, "private-upstream-error", "private-user", "private-token", "private-title", "Bearer"]) {
      expect(logs).not.toContain(privateValue);
    }
  });

  it("reports all failed shows without claiming any refresh succeeded", async () => {
    refreshMetadata.mockRejectedValue(new Error("upstream failure"));
    const response = await GET(request());
    expect(await response.json()).toEqual({
      ok: true, considered: 3, refreshed: 0, failed: 3,
      results: [20, 10, 30].map((tmdbId) => ({ tmdbId, status: "failed" })),
    });
  });

  it("returns a successful empty summary for zero candidates", async () => {
    selectCandidates.mockResolvedValue([]);
    const response = await GET(request());
    expect(await response.json()).toEqual({ ok: true, considered: 0, refreshed: 0, failed: 0, results: [] });
    expect(refreshMetadata).not.toHaveBeenCalled();
  });

  it("fails before selection when the metadata client is not configured", async () => {
    createMetadataClient.mockReturnValue(null);
    const response = await GET(request());
    expect(response.status).toBe(503);
    expect(selectCandidates).not.toHaveBeenCalled();
    expect(refreshMetadata).not.toHaveBeenCalled();
  });

  it.each(["client", "selector"])("returns a safe server error for %s failure without refreshing", async (source) => {
    const failure = new Error(`private-configuration ${SECRET}`);
    if (source === "client") createMetadataClient.mockImplementation(() => { throw failure; });
    else selectCandidates.mockRejectedValue(failure);
    const response = await GET(request());
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ ok: false, error: { message: "Unable to prepare metadata refresh." } });
    expect(refreshMetadata).not.toHaveBeenCalled();
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("private-configuration");
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(SECRET);
  });

  it("allows authenticated dry run and returns only selected IDs without refreshing", async () => {
    selectCandidates.mockResolvedValue([{ ...candidates(20)[0], user_id: "private-user", favourite: true }]);
    const response = await GET(request("?dryRun=1"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, dryRun: true, considered: 1, candidates: [{ tmdbId: 20 }] });
    expect(selectCandidates.mock.calls).toEqual([[metadataClient, { control: expect.any(Object) }]]);
    expect(refreshMetadata).not.toHaveBeenCalled();
    expect(beginRefresh).not.toHaveBeenCalled();
  });

  it("fails dry run safely when selection fails", async () => {
    selectCandidates.mockRejectedValue(new Error("private-upstream-error"));
    const response = await GET(request("?dryRun=1"));
    expect(response.status).toBe(500);
    expect(refreshMetadata).not.toHaveBeenCalled();
    expect(beginRefresh).not.toHaveBeenCalled();
  });

  it("does not start unreserved work and continues to the next candidate", async () => {
    beginRefresh.mockRejectedValueOnce(new Error("private bookkeeping error"));
    const response = await GET(request());
    expect(refreshMetadata.mock.calls.map(([id]) => id)).toEqual([10, 30]);
    expect(await response.json()).toMatchObject({ considered: 3, refreshed: 2, failed: 1 });
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("private bookkeeping error");
  });

  it("shares the original invocation deadline with selection and show execution", async () => {
    vi.useFakeTimers();
    try {
      selectCandidates.mockImplementationOnce(async (_client, { control }) => {
        vi.setSystemTime(Date.now() + 221_000);
        expect(() => control.checkTime()).toThrow("time budget");
        throw new Error("budget exhausted during selection");
      });
      const response = await GET(request());
      expect(response.status).toBe(500);
      expect(beginRefresh).not.toHaveBeenCalled();
      expect(refreshMetadata).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it.each(["true", "0", ""])("rejects ambiguous dryRun=%s instead of performing writes", async (value) => {
    const response = await GET(request(`?dryRun=${value}`));
    expect(response.status).toBe(400);
    expectNoWork();
  });
});

describe("cron middleware bypass", () => {
  it("does not read user sessions for the cron endpoint, including unauthorized dry runs", async () => {
    const response = await middleware(request("?dryRun=1", null));
    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(updateSession).not.toHaveBeenCalled();
  });

  it.each(["/dashboard", "/shows/20", "/api/profile/export", "/api/cron/refresh-metadata-other"])(
    "preserves session middleware for %s", async (path) => {
      const pageRequest = new NextRequest(`https://episodic.example${path}`);
      await middleware(pageRequest);
      expect(updateSession).toHaveBeenCalledWith(pageRequest);
    },
  );
});

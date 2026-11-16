import { PGlite } from "@electric-sql/pglite";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { beginScheduledMetadataRefresh, metadataRefreshRetryState } from "../features/shows/metadata-refresh-retry";
import type { MetadataRefreshCandidate } from "../features/shows/metadata-refresh-candidates";
import type { Database, Json } from "../lib/supabase/types";
import { createScheduledTmdbRequestControl } from "../lib/tmdb/scheduled-requests";

vi.mock("server-only", () => ({}));
const NOW = Date.parse("2026-11-16T05:00:00Z");
const DAY = 86_400_000;
let db: PGlite;
let client: SupabaseClient<Database>;
let fetch: ReturnType<typeof vi.fn>;

async function candidate(): Promise<MetadataRefreshCandidate> {
  const { rows } = await db.query<{ metadata: Json; last_synced_at: string | null }>(
    "select metadata, last_synced_at::text from shows where tmdb_id = 42",
  );
  return { tmdbId: 42, tmdbStatus: "Returning Series", lastSyncedAt: rows[0].last_synced_at, metadata: rows[0].metadata };
}

describe("durable scheduled refresh retries", () => {
  beforeAll(async () => {
    db = new PGlite();
    await db.exec("create table shows(tmdb_id integer primary key, metadata jsonb not null, last_synced_at timestamptz, title text default 'Original')");
  }, 60_000);
  afterAll(async () => { await db?.close(); });
  beforeEach(async () => {
    await db.exec("truncate shows; insert into shows(tmdb_id, metadata) values (42, '{\"creators\":[{\"id\":1,\"name\":\"A,B (C)\"}],\"custom\":true}')");
    // Exercise the real SDK's PATCH/filter serialization, evaluating its guards
    // against PostgreSQL rather than treating every update as a successful mock.
    fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      expect(url.pathname).toBe("/rest/v1/shows");
      expect(init?.method).toBe("PATCH");
      expect(url.searchParams.get("select")).toBe("tmdb_id");
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      const payload = JSON.parse(String(init!.body));
      expect(Object.keys(payload)).toEqual(["metadata"]);
      const freshness = url.searchParams.get("last_synced_at")!;
      const { rows } = await db.query(
        `update shows set metadata=$1::jsonb where tmdb_id=$2 and metadata=$3::jsonb
         and last_synced_at is not distinct from $4::timestamptz returning tmdb_id`,
        [JSON.stringify(payload.metadata), Number(url.searchParams.get("tmdb_id")!.slice(3)),
          url.searchParams.get("metadata")!.slice(3), freshness === "is.null" ? null : freshness.slice(3)],
      );
      return Response.json(rows);
    });
    client = createClient<Database>("https://test.supabase.co", "test-key", {
      auth: { persistSession: false, autoRefreshToken: false }, global: { fetch },
    });
  });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it("persists exponential retry windows before any refresh work, preserving metadata and freshness", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const original = await candidate();
    for (const [index, days] of [2, 4, 8, 16, 30, 30].entries()) {
      const now = NOW + index * 31 * DAY;
      vi.setSystemTime(now);
      await beginScheduledMetadataRefresh(await candidate(), client, createScheduledTmdbRequestControl(now + 240_000));
      const saved = await candidate();
      expect(metadataRefreshRetryState(saved.metadata)).toEqual({ failureCount: Math.min(index + 1, 5), retryAt: now + days * DAY });
      expect(saved.metadata).toMatchObject(original.metadata as object);
      expect(saved.lastSyncedAt).toBeNull();
      expect((await db.query("select title from shows")).rows).toEqual([{ title: "Original" }]);
    }
  });

  it.each(["metadata", "freshness"])("does not overwrite a concurrent %s change", async (kind) => {
    const snapshot = await candidate();
    if (kind === "metadata") await db.exec("update shows set metadata=metadata || '{\"newer\":true}'::jsonb");
    else await db.exec("update shows set last_synced_at='2026-11-16T04:00:00Z'");
    const before = await candidate();
    await expect(beginScheduledMetadataRefresh(snapshot, client, createScheduledTmdbRequestControl(Date.now() + 240_000))).rejects.toThrow("reserve");
    expect(await candidate()).toEqual(before);
  });

  it("allows only one reservation from the same snapshot", async () => {
    const snapshot = await candidate();
    const control = createScheduledTmdbRequestControl(Date.now() + 240_000);
    await beginScheduledMetadataRefresh(snapshot, client, control);
    const reserved = await candidate();
    await expect(beginScheduledMetadataRefresh(snapshot, client, control)).rejects.toThrow("reserve");
    expect(await candidate()).toEqual(reserved);
  });

  it("restores previous retry state after a global configuration failure", async () => {
    await db.exec(`update shows set metadata=metadata || '{"scheduledRefreshRetry":{"failureCount":3,"retryAt":"2026-01-01T00:00:00Z"}}'::jsonb`);
    const snapshot = await candidate();
    const cancel = await beginScheduledMetadataRefresh(snapshot, client, createScheduledTmdbRequestControl(Date.now() + 240_000));
    expect(await candidate()).not.toEqual(snapshot);
    await cancel();
    expect(await candidate()).toEqual(snapshot);
    // A corrected configuration can reserve again without waiting for backoff.
    await expect(beginScheduledMetadataRefresh(snapshot, client, createScheduledTmdbRequestControl(Date.now() + 240_000))).resolves.toBeTypeOf("function");
  });

  it.each(["metadata", "freshness"])("does not roll back a newer concurrent %s change when releasing", async (kind) => {
    const cancel = await beginScheduledMetadataRefresh(await candidate(), client, createScheduledTmdbRequestControl(Date.now() + 240_000));
    if (kind === "metadata") await db.exec("update shows set metadata='{\"newer\":true}'");
    else await db.exec("update shows set last_synced_at=now()");
    const newer = await candidate();
    await cancel();
    expect(await candidate()).toEqual(newer);
  });

  it("does not roll back successful metadata on a repeated release", async () => {
    const cancel = await beginScheduledMetadataRefresh(await candidate(), client, createScheduledTmdbRequestControl(Date.now() + 240_000));
    await cancel();
    await db.exec("update shows set metadata='{\"newer\":true}', last_synced_at=now()");
    const newer = await candidate();
    await cancel();
    expect(await candidate()).toEqual(newer);
  });

  it("guards non-null freshness and leaves the successful sync timestamp unchanged", async () => {
    await db.exec("update shows set last_synced_at='2026-01-01T00:00:00Z'");
    const snapshot = await candidate();
    await beginScheduledMetadataRefresh(snapshot, client, createScheduledTmdbRequestControl(Date.now() + 240_000));
    expect((await candidate()).lastSyncedAt).toBe(snapshot.lastSyncedAt);
  });

  it("fails closed on reservation errors and does not expose database details", async () => {
    fetch.mockResolvedValueOnce(Response.json({ message: "private service error", code: "XX000" }, { status: 500 }));
    const before = await candidate();
    await expect(beginScheduledMetadataRefresh(before, client, createScheduledTmdbRequestControl(Date.now() + 240_000))).rejects.toThrow("Unable to reserve metadata refresh attempt.");
    expect(await candidate()).toEqual(before);
  });

  it("does not reserve shows when there is no time to begin work", async () => {
    await expect(beginScheduledMetadataRefresh(await candidate(), client, createScheduledTmdbRequestControl(Date.now() + 1000))).rejects.toThrow("time budget");
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([null, [], {}, { scheduledRefreshRetry: "invalid" }, { scheduledRefreshRetry: { failureCount: -1, retryAt: "invalid" } }])(
    "treats absent or malformed retry state as a first attempt: %j", (metadata) => {
      expect(metadataRefreshRetryState(metadata)).toEqual({ failureCount: 0, retryAt: null });
    },
  );
});

import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { upsertTmdbShowMetadata } from "../features/search/data";
import { getMetadataRefreshCandidates } from "../features/shows/metadata-refresh-candidates";
import type { Database } from "../lib/supabase/types";
import { normalizeFullShowDetails } from "../lib/tmdb/normalize";

vi.mock("server-only", () => ({}));
const USER = "00000000-0000-4000-8000-000000000001";
const NOW = new Date("2026-11-16T05:00:00.000Z");
const OLD_SYNC = "2026-01-01T05:00:00.000Z";
const retryMetadata = { custom: true, scheduledRefreshRetry: { failureCount: 3, retryAt: "2026-11-15T05:00:00.000Z" } };
const details = normalizeFullShowDetails({
  id: 42, name: "Updated show", status: "Ended",
  seasons: [1, 2].map((number) => ({ id: 100 + number, season_number: number, episode_count: 1 })),
}, [1, 2].map((number) => ({
  id: 100 + number, season_number: number,
  episodes: [{ id: 200 + number, season_number: number, episode_number: 1, name: "Updated episode", air_date: "2020-01-01" }],
})));
let db: PGlite;
let client: SupabaseClient<Database>;
let failAtWrite: number;
let writes: number;
let snapshots: object[][];

function identifier(value: string) {
  if (!/^[a-z_]+$/.test(value)) throw new Error("Invalid test SQL identifier");
  return `"${value}"`;
}
async function show() { return (await db.query<Record<string, unknown>>("select * from shows order by tmdb_id")).rows; }
async function tracking() {
  return {
    library: (await db.query("select * from user_shows order by id")).rows,
    watched: (await db.query("select * from watched_episodes order by id")).rows,
  };
}
async function seedExisting() {
  await db.query("insert into shows(tmdb_id,title,tmdb_status,last_synced_at,metadata) values(42,'Original','Ended',$1,$2::jsonb)", [OLD_SYNC, JSON.stringify(retryMetadata)]);
  await db.exec(`
    insert into seasons(show_tmdb_id,season_number,name) values(42,1,'Original season');
    insert into episodes(show_tmdb_id,season_number,episode_number,title) values(42,1,1,'Original episode');
    insert into user_shows(user_id,show_tmdb_id,status,favourite) values('${USER}',42,'watching',true);
    insert into watched_episodes(user_id,show_tmdb_id,season_number,episode_number) values('${USER}',42,1,1);
  `);
}
function write() { return upsertTmdbShowMetadata({ metadataClient: client, tmdbShow: details, lastSyncedAt: NOW.toISOString() }); }

describe("full metadata writer recovery on PostgreSQL", () => {
  beforeAll(async () => {
    db = new PGlite();
    await db.exec("create schema auth; create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}')");
    await db.exec(await readFile(new URL("../supabase/migrations/20260604000100_create_core_schema.sql", import.meta.url), "utf8"));
    await db.query("insert into auth.users(id,email) values($1,'test@example.invalid')", [USER]);
  }, 60_000);
  afterAll(async () => { await db?.close(); });
  beforeEach(async () => {
    await db.exec("truncate shows cascade");
    failAtWrite = -1;
    writes = 0;
    snapshots = [];
    // Use the actual SDK and writer against the repository's real schema/FKs.
    // This small PostgREST transport stand-in executes each HTTP upsert as one
    // PostgreSQL transaction and injects failures between committed requests.
    client = createClient<Database>("https://test.supabase.co", "test-key", {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: async (input, init) => {
        const url = new URL(String(input));
        const offset = Number(url.searchParams.get("offset") ?? 0);
        const limit = Number(url.searchParams.get("limit") ?? 1000);
        if (url.pathname.endsWith("/rpc/metadata_refresh_eligible_library_rows")) {
          expect(url.searchParams.get("select")?.split(",")).toContain("id");
          return Response.json((await db.query("select id,show_tmdb_id from user_shows where status <> 'dropped' order by id offset $1 limit $2", [offset, limit])).rows);
        }
        if (init?.method === "GET") {
          if (url.pathname === "/rest/v1/episodes") {
            const ids = url.searchParams.get("show_tmdb_id")!.slice(4, -1).split(",").map(Number);
            const dates = url.searchParams.getAll("air_date");
            return Response.json((await db.query("select show_tmdb_id,air_date,title,overview,runtime_minutes from episodes where show_tmdb_id=any($1::integer[]) and season_number>0 and air_date >= $2::date and air_date <= $3::date order by show_tmdb_id,season_number,episode_number offset $4 limit $5", [ids, dates.find((value) => value.startsWith("gte."))!.slice(4), dates.find((value) => value.startsWith("lte."))!.slice(4), offset, limit])).rows);
          }
          expect(url.pathname).toBe("/rest/v1/shows");
          const ids = url.searchParams.get("tmdb_id")!.slice(4, -1).split(",").map(Number);
          return Response.json((await db.query("select tmdb_id,last_synced_at,tmdb_status,metadata from shows where tmdb_id=any($1::integer[]) order by tmdb_id offset $2 limit $3", [ids, offset, limit])).rows);
        }
        const table = url.pathname.split("/").at(-1)!;
        expect(["shows", "seasons", "episodes"]).toContain(table);
        expect(init?.method).toBe("POST");
        if (++writes === failAtWrite) return Response.json({ message: "Injected write failure", code: "XX000" }, { status: 500 });
        const payload = JSON.parse(String(init!.body));
        const rows = Array.isArray(payload) ? payload : [payload];
        const conflict = url.searchParams.get("on_conflict")!.split(",").map(identifier).join(",");
        const ignore = new Headers(init?.headers).get("Prefer")!.includes("resolution=ignore-duplicates");
        await db.transaction(async (tx) => {
          for (const row of rows) {
            const columns = Object.keys(row).map(identifier);
            const parameters = Object.values(row).map((value) => typeof value === "object" && value !== null ? JSON.stringify(value) : value);
            const action = ignore ? "do nothing" : `do update set ${columns.map((column) => `${column}=excluded.${column}`).join(",")}`;
            await tx.query(`insert into ${identifier(table)} (${columns.join(",")}) values (${columns.map((_, index) => `$${index + 1}`).join(",")}) on conflict (${conflict}) ${action}`, parameters);
          }
        });
        snapshots.push(await show());
        return new Response(null, { status: 201 });
      } },
    });
  });

  it("satisfies first-import foreign keys without claiming freshness until all children are saved", async () => {
    await write();
    expect(snapshots.slice(0, 3).every((rows) => (rows[0] as { last_synced_at: unknown }).last_synced_at === null)).toBe(true);
    expect((await show())[0]).toMatchObject({ title: "Updated show", last_synced_at: NOW });
    expect((await db.query("select * from episodes")).rows).toHaveLength(2);
  });

  it("clears retry state only on complete success and preserves tracking data", async () => {
    await seedExisting();
    const before = await show();
    const tracked = await tracking();
    await write();
    expect(snapshots.slice(0, 3)).toEqual([before, before, before]);
    expect((await show())[0]).toMatchObject({ last_synced_at: NOW, title: "Updated show" });
    expect((await show())[0]).not.toHaveProperty("metadata.scheduledRefreshRetry");
    expect(await tracking()).toEqual(tracked);
  });

  it.each([2, 3, 4])("keeps failed manual refresh %s eligible for automatic repair with existing retry state intact", async (failure) => {
    await seedExisting();
    const before = await show();
    const tracked = await tracking();
    failAtWrite = failure;
    await expect(write()).rejects.toThrow(/Unable to save .* metadata/);
    expect(await show()).toEqual(before);
    expect(await tracking()).toEqual(tracked);
    const candidates = await getMetadataRefreshCandidates(client, { now: NOW });
    expect(candidates.map((row) => row.tmdbId)).toEqual([42]);
    expect(candidates[0].metadata).toEqual(retryMetadata);
  });

  it.each([2, 3, 4])("leaves first-import failure %s stale and allows a complete retry", async (failure) => {
    failAtWrite = failure;
    await expect(write()).rejects.toThrow(/Unable to save .* metadata/);
    expect((await show())[0]).toMatchObject({ last_synced_at: null, metadata: {} });
    failAtWrite = -1;
    await write();
    expect(await show()).toHaveLength(1);
    expect((await show())[0]).toMatchObject({ last_synced_at: NOW });
    expect((await db.query("select * from seasons")).rows).toHaveLength(2);
    expect((await db.query("select * from episodes")).rows).toHaveLength(2);
  });

  it("does not write children if ensuring the parent fails", async () => {
    failAtWrite = 1;
    await expect(write()).rejects.toThrow("Unable to save show metadata");
    expect(await show()).toEqual([]);
    expect((await db.query("select * from seasons")).rows).toEqual([]);
    expect(writes).toBe(1);
  });
});

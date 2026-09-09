import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import {
  getMetadataRefreshCandidates,
  MetadataRefreshCandidateError,
} from "../features/shows/metadata-refresh-candidates";
import type { Database } from "../lib/supabase/types";

vi.mock("server-only", () => ({}));

type Table = "user_shows" | "shows";
type LibraryRow = Pick<Database["public"]["Tables"]["user_shows"]["Row"], "id" | "show_tmdb_id" | "status" | "favourite">;
type ShowRow = Pick<Database["public"]["Tables"]["shows"]["Row"], "tmdb_id" | "last_synced_at" | "tmdb_status">;
type QueryCall = { table: Table; columns: string; start: number; end: number; ids?: number[] };

const NOW = new Date("2026-09-09T12:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

function syncedAgo(age: number) {
  return new Date(NOW.getTime() - age).toISOString();
}

class FakeSupabase {
  userShows: LibraryRow[] = [];
  shows: ShowRow[] = [];
  watchedEpisodes = [{ show_tmdb_id: 1, season_number: 1, episode_number: 1 }];
  calls: QueryCall[] = [];
  rowCap = 1000;
  failCall: number | null = null;
  nullCall: number | null = null;

  from(table: Table) {
    if (table !== "user_shows" && table !== "shows") throw new Error("Unexpected table access");
    let columns = "";
    let excludedStatus: string | undefined;
    let ids: number[] | undefined;
    let orderColumn = "";

    const query = {
      select(value: string) { columns = value; return query; },
      neq(column: string, value: string) {
        expect(column).toBe("status");
        excludedStatus = value;
        return query;
      },
      in(column: string, values: number[]) {
        expect(column).toBe("tmdb_id");
        ids = values;
        return query;
      },
      order(column: string, options: { ascending: boolean }) {
        expect(options.ascending).toBe(true);
        orderColumn = column;
        return query;
      },
      range: async (start: number, end: number) => {
        this.calls.push({ table, columns, start, end, ids });
        if (this.calls.length === this.failCall) {
          return { data: null, error: { message: "private upstream details" } };
        }
        if (this.calls.length === this.nullCall) return { data: null, error: null };

        const rows = table === "user_shows"
          ? this.userShows.filter((row) => row.status !== excludedStatus)
          : this.shows.filter((row) => ids?.includes(row.tmdb_id));
        const ordered = [...rows].sort((a, b) =>
          Number(a[orderColumn as keyof typeof a]) - Number(b[orderColumn as keyof typeof b]),
        );
        const data = ordered.slice(start, Math.min(end + 1, start + this.rowCap)).map((row) =>
          Object.fromEntries(columns.split(",").map((column) => [column, row[column as keyof typeof row]])),
        );
        return { data, error: null };
      },
    };
    return query;
  }
}

function client(db: FakeSupabase) {
  return db as unknown as SupabaseClient<Database>;
}

function addShow(db: FakeSupabase, tmdbId: number, status: string | null = "Returning Series", lastSyncedAt: string | null = null) {
  db.shows.push({ tmdb_id: tmdbId, last_synced_at: lastSyncedAt, tmdb_status: status });
  db.userShows.push({ id: db.userShows.length + 1, show_tmdb_id: tmdbId, status: "watchlist", favourite: false });
}

describe("metadata refresh candidates", () => {
  it("deduplicates active libraries, excludes dropped-only/untracked shows, and ignores favourite and watched state", async () => {
    const db = new FakeSupabase();
    addShow(db, 1);
    addShow(db, 2);
    addShow(db, 3);
    addShow(db, 4);
    db.userShows[1].status = "dropped";
    db.userShows[2].favourite = true;
    db.userShows[2].status = "watched";
    db.userShows[3].status = "watching";
    db.userShows.push(
      { id: 5, show_tmdb_id: 1, status: "dropped", favourite: true },
      { id: 6, show_tmdb_id: 1, status: "watching", favourite: true },
      { id: 7, show_tmdb_id: 2, status: "dropped", favourite: false },
    );
    db.shows.push({ tmdb_id: 5, tmdb_status: null, last_synced_at: null });
    const before = structuredClone({ shows: db.shows, userShows: db.userShows, watchedEpisodes: db.watchedEpisodes });

    const candidates = await getMetadataRefreshCandidates(client(db), { now: NOW });

    expect(candidates).toEqual([1, 3, 4].map((tmdbId) => ({ tmdbId, tmdbStatus: "Returning Series", lastSyncedAt: null })));
    expect({ shows: db.shows, userShows: db.userShows, watchedEpisodes: db.watchedEpisodes }).toEqual(before);
    expect(db.calls.every((call) => call.columns === (call.table === "user_shows" ? "show_tmdb_id" : "tmdb_id,last_synced_at,tmdb_status"))).toBe(true);
    db.watchedEpisodes = [];
    db.userShows.forEach((row) => { row.favourite = !row.favourite; });
    expect(await getMetadataRefreshCandidates(client(db), { now: NOW })).toEqual(candidates);
  });

  it.each(["Returning Series", "In Production", "Planned", null, "Unknown Lifecycle", "", " returning SERIES "])(
    "uses the inclusive 24-hour threshold for %s", async (status) => {
      const db = new FakeSupabase();
      addShow(db, 1, status, syncedAgo(DAY + 1));
      addShow(db, 2, status, syncedAgo(DAY));
      addShow(db, 3, status, syncedAgo(DAY - 1));
      addShow(db, 4, status, syncedAgo(-DAY));
      expect((await getMetadataRefreshCandidates(client(db), { now: NOW })).map((row) => row.tmdbId)).toEqual([1, 2]);
    },
  );

  it.each(["Ended", "Canceled", "Cancelled", " eNDeD ", " CANCELED ", " cancelled "])(
    "uses the inclusive 30-day threshold for %s", async (status) => {
      const db = new FakeSupabase();
      addShow(db, 1, status, syncedAgo(30 * DAY + 1));
      addShow(db, 2, status, syncedAgo(30 * DAY));
      addShow(db, 3, status, syncedAgo(30 * DAY - 1));
      addShow(db, 4, status, syncedAgo(2 * DAY));
      expect((await getMetadataRefreshCandidates(client(db), { now: NOW })).map((row) => row.tmdbId)).toEqual([1, 2]);
    },
  );

  it("orders null syncs first, then lifecycle, age and ID independent of input order", async () => {
    const db = new FakeSupabase();
    addShow(db, 90, "Ended", syncedAgo(60 * DAY));
    addShow(db, 30, "Ended", null);
    addShow(db, 20, "Returning Series", null);
    addShow(db, 10, null, null);
    addShow(db, 70, "Returning Series", syncedAgo(2 * DAY));
    addShow(db, 60, "Returning Series", syncedAgo(2 * DAY));
    addShow(db, 50, "Unknown", syncedAgo(3 * DAY));
    addShow(db, 80, "Canceled", syncedAgo(31 * DAY));
    const expectedIds = [10, 20, 30, 50, 60, 70, 90, 80];
    const select = () => getMetadataRefreshCandidates(client(db), { now: NOW, batchSize: 10 });

    expect((await select()).map((row) => row.tmdbId)).toEqual(expectedIds);
    db.userShows.reverse();
    db.shows.reverse();
    expect((await select()).map((row) => row.tmdbId)).toEqual(expectedIds);
  });

  it.each([
    [undefined, 5], [1, 1], [10, 10], [100, 10], [0, 5], [-1, 5], [1.5, 5], [NaN, 5], [Infinity, 5], ["3", 5], [null, 5],
  ])("normalizes batch size %s to %s", async (batchSize, expected) => {
    const db = new FakeSupabase();
    for (let id = 1; id <= 12; id++) addShow(db, id);
    const candidates = await getMetadataRefreshCandidates(client(db), { now: NOW, batchSize: batchSize as number | undefined });
    expect(candidates.map((row) => row.tmdbId)).toEqual(Array.from({ length: Number(expected) }, (_, i) => i + 1));
  });

  it.each([1000, 7])("discovers highest-priority shows beyond library pages and metadata batches with row cap %s", async (rowCap) => {
    const db = new FakeSupabase();
    db.rowCap = rowCap;
    for (let id = 1; id <= 1101; id++) addShow(db, id, "Returning Series", syncedAgo(0));
    db.shows[1100].last_synced_at = null;
    db.userShows.splice(1, 0, { id: 1102, show_tmdb_id: 1, status: "watching", favourite: true });

    expect(await getMetadataRefreshCandidates(client(db), { now: NOW, batchSize: 1 })).toEqual([
      { tmdbId: 1101, lastSyncedAt: null, tmdbStatus: "Returning Series" },
    ]);
    expect(db.calls.some((call) => call.table === "user_shows" && call.start >= 1000)).toBe(true);
    const metadataCalls = db.calls.filter((call) => call.table === "shows");
    expect(metadataCalls.every((call) => call.ids!.length <= 100)).toBe(true);
    expect(metadataCalls.some((call) => call.ids!.includes(1101))).toBe(true);
    if (rowCap === 7) expect(metadataCalls.some((call) => call.start === 7)).toBe(true);
  });

  it("returns empty when no non-dropped library exists without loading shows", async () => {
    const db = new FakeSupabase();
    addShow(db, 1);
    db.userShows[0].status = "dropped";
    expect(await getMetadataRefreshCandidates(client(db), { now: NOW })).toEqual([]);
    expect(db.calls.map((call) => call.table)).toEqual(["user_shows"]);
  });

  it.each([1, 2, 3, 4])("propagates query failure at call %s, including later pages", async (failCall) => {
    const db = new FakeSupabase();
    addShow(db, 1);
    db.failCall = failCall;
    const result = getMetadataRefreshCandidates(client(db), { now: NOW });
    await expect(result).rejects.toBeInstanceOf(MetadataRefreshCandidateError);
    await expect(result).rejects.not.toThrow("private upstream details");
  });

  it.each([1, 2, 3, 4])("rejects a null response at call %s instead of returning a partial batch", async (nullCall) => {
    const db = new FakeSupabase();
    addShow(db, 1);
    db.nullCall = nullCall;
    await expect(getMetadataRefreshCandidates(client(db), { now: NOW })).rejects.toThrow(/Unable to load metadata refresh/);
  });

  it("rejects missing shared show rows instead of silently dropping eligible IDs", async () => {
    const db = new FakeSupabase();
    addShow(db, 1);
    addShow(db, 2);
    db.shows.pop();
    await expect(getMetadataRefreshCandidates(client(db), { now: NOW })).rejects.toThrow("Incomplete metadata refresh candidate response.");
  });

  it("rejects an invalid timestamp rather than silently classifying it as fresh", async () => {
    const db = new FakeSupabase();
    addShow(db, 1, null, "invalid");
    await expect(getMetadataRefreshCandidates(client(db), { now: NOW })).rejects.toThrow("Invalid metadata refresh timestamp.");
  });

  it("rejects invalid reference time before querying", async () => {
    const db = new FakeSupabase();
    await expect(getMetadataRefreshCandidates(client(db), { now: new Date(NaN) })).rejects.toThrow("Invalid metadata refresh reference time.");
    expect(db.calls).toEqual([]);
  });

  it("uses the default reference instant when options are omitted", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(NOW);
      const db = new FakeSupabase();
      addShow(db, 1, null, syncedAgo(DAY));
      expect((await getMetadataRefreshCandidates(client(db))).map((row) => row.tmdbId)).toEqual([1]);
    } finally {
      vi.useRealTimers();
    }
  });
});

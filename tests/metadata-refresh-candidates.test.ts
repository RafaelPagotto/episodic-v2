import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import {
  getMetadataRefreshCandidates,
  MetadataRefreshCandidateError,
} from "../features/shows/metadata-refresh-candidates";
import type { Database, Json } from "../lib/supabase/types";
import { createScheduledTmdbRequestControl } from "../lib/tmdb/scheduled-requests";
import { beginScheduledMetadataRefresh } from "../features/shows/metadata-refresh-retry";

vi.mock("server-only", () => ({}));

type Table = "user_shows" | "shows" | "episodes";
type LibraryRow = Pick<Database["public"]["Tables"]["user_shows"]["Row"], "id" | "show_tmdb_id" | "status" | "favourite">;
type ShowRow = Pick<Database["public"]["Tables"]["shows"]["Row"], "tmdb_id" | "last_synced_at" | "tmdb_status" | "metadata">;
type AiringEpisodeRow = Pick<Database["public"]["Tables"]["episodes"]["Row"], "show_tmdb_id" | "season_number" | "episode_number" | "air_date" | "title" | "overview" | "runtime_minutes">;
type QueryCall = { table: Table; columns: string; start: number; end: number; ids?: number[] };

const NOW = new Date("2026-09-09T12:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

function syncedAgo(age: number) {
  return new Date(NOW.getTime() - age).toISOString();
}

class FakeSupabase {
  userShows: LibraryRow[] = [];
  shows: ShowRow[] = [];
  episodes: AiringEpisodeRow[] = [];
  watchedEpisodes = [{ show_tmdb_id: 1, season_number: 1, episode_number: 1 }];
  calls: QueryCall[] = [];
  rowCap = 1000;
  failCall: number | null = null;
  nullCall: number | null = null;
  signals: AbortSignal[] = [];
  onRead?: () => void;

  rpc(name: string) {
    expect(name).toBe("metadata_refresh_eligible_library_rows");
    // The service-only RPC enforces non-dropped permanent ownership in SQL.
    return this.from("user_shows").neq("status", "dropped");
  }

  from(table: Table) {
    if (!["user_shows", "shows", "episodes"].includes(table)) throw new Error("Unexpected table access");
    let columns = "";
    let excludedStatus: string | undefined;
    let ids: number[] | undefined;
    let orderColumn = "";
    const filters: { column: string; value: number | string; operator: "gt" | "gte" | "lte" }[] = [];

    const query = {
      update: (values: { metadata: Json }) => {
        const filters = new Map<string, unknown>();
        const update = {
          eq: (column: string, value: unknown) => { filters.set(column, value); return update; },
          is: (column: string, value: null) => { filters.set(column, value); return update; },
          select: () => update,
          abortSignal: async () => {
            const row = this.shows.find((row) => row.tmdb_id === filters.get("tmdb_id")
              && row.last_synced_at === filters.get("last_synced_at")
              && JSON.stringify(row.metadata) === filters.get("metadata"));
            if (!row) return { data: [], error: null };
            row.metadata = structuredClone(values.metadata);
            return { data: [{ tmdb_id: row.tmdb_id }], error: null };
          },
        };
        return update;
      },
      select(value: string) { columns = value; return query; },
      neq(column: string, value: string) {
        expect(column).toBe("status");
        excludedStatus = value;
        return query;
      },
      in(column: string, values: number[]) {
        expect(column).toBe(table === "episodes" ? "show_tmdb_id" : "tmdb_id");
        ids = values;
        return query;
      },
      gt(column: string, value: number) { filters.push({ column, value, operator: "gt" }); return query; },
      gte(column: string, value: string) { filters.push({ column, value, operator: "gte" }); return query; },
      lte(column: string, value: string) { filters.push({ column, value, operator: "lte" }); return query; },
      order(column: string, options: { ascending: boolean } = { ascending: true }) {
        expect(options.ascending).toBe(true);
        orderColumn = column;
        return query;
      },
      range: (start: number, end: number) => ({ abortSignal: async (signal: AbortSignal) => {
        this.signals.push(signal);
        this.onRead?.();
        this.calls.push({ table, columns, start, end, ids });
        if (table === "user_shows" && !columns.split(",").includes(orderColumn)) {
          return { data: null, error: { code: "42703", message: "column record.id does not exist" } };
        }
        if (this.calls.length === this.failCall) {
          return { data: null, error: { message: "private upstream details" } };
        }
        if (this.calls.length === this.nullCall) return { data: null, error: null };

        const rows = table === "user_shows"
          ? this.userShows.filter((row) => row.status !== excludedStatus)
          : table === "shows" ? this.shows.filter((row) => ids?.includes(row.tmdb_id))
            : this.episodes.filter((row) => ids?.includes(row.show_tmdb_id) && filters.every(({ column, value, operator }) => {
              const actual = row[column as keyof AiringEpisodeRow];
              if (actual === null) return false;
              return operator === "gt" ? actual > value : operator === "gte" ? actual >= value : actual <= value;
            }));
        const ordered = [...rows].sort((a, b) =>
          Number(a[orderColumn as keyof typeof a]) - Number(b[orderColumn as keyof typeof b]),
        );
        const data = ordered.slice(start, Math.min(end + 1, start + this.rowCap)).map((row) =>
          Object.fromEntries(columns.split(",").map((column) => [column, row[column as keyof typeof row]])),
        );
        return { data, error: null };
      } }),
    };
    return query;
  }
}

function client(db: FakeSupabase) {
  return db as unknown as SupabaseClient<Database>;
}

function addShow(db: FakeSupabase, tmdbId: number, status: string | null = "Returning Series", lastSyncedAt: string | null = null) {
  db.shows.push({ tmdb_id: tmdbId, last_synced_at: lastSyncedAt, tmdb_status: status, metadata: {} });
  db.userShows.push({ id: db.userShows.length + 1, show_tmdb_id: tmdbId, status: "watchlist", favourite: false });
}

function addAiringEpisode(db: FakeSupabase, showId: number, airDate = "2026-09-09", overrides: Partial<AiringEpisodeRow> = {}) {
  db.episodes.push({ show_tmdb_id: showId, season_number: 1, episode_number: 1, air_date: airDate, title: "Named episode", overview: "Synopsis", runtime_minutes: 45, ...overrides });
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
    db.shows.push({ tmdb_id: 5, tmdb_status: null, last_synced_at: null, metadata: {} });
    const before = structuredClone({ shows: db.shows, userShows: db.userShows, watchedEpisodes: db.watchedEpisodes });

    const candidates = await getMetadataRefreshCandidates(client(db), { now: NOW });

    expect(candidates).toEqual([1, 3, 4].map((tmdbId) => ({ tmdbId, tmdbStatus: "Returning Series", lastSyncedAt: null, metadata: {} })));
    expect({ shows: db.shows, userShows: db.userShows, watchedEpisodes: db.watchedEpisodes }).toEqual(before);
    expect(db.calls.every((call) => call.columns === (call.table === "user_shows" ? "id,show_tmdb_id" : call.table === "shows" ? "tmdb_id,last_synced_at,tmdb_status,metadata" : "show_tmdb_id,air_date,title,overview,runtime_minutes"))).toBe(true);
    expect(db.signals).toHaveLength(db.calls.length);
    expect(db.signals.every((signal) => signal instanceof AbortSignal)).toBe(true);
    db.watchedEpisodes = [];
    db.userShows.forEach((row) => { row.favourite = !row.favourite; });
    expect(await getMetadataRefreshCandidates(client(db), { now: NOW })).toEqual(candidates);
  });

  it.each(["Returning Series", "In Production", "Planned", null, "Unknown Lifecycle", "", " returning SERIES "])(
    "uses the inclusive 5-day threshold for %s", async (status) => {
      const db = new FakeSupabase();
      addShow(db, 1, status, syncedAgo(5 * DAY + 1));
      addShow(db, 2, status, syncedAgo(5 * DAY));
      addShow(db, 3, status, syncedAgo(5 * DAY - 1));
      addShow(db, 4, status, syncedAgo(4 * DAY));
      expect((await getMetadataRefreshCandidates(client(db), { now: NOW })).map((row) => row.tmdbId)).toEqual([1, 2]);
    },
  );

  it.each(["Ended", "Canceled", "Cancelled", " eNDeD ", " CANCELED ", " cancelled "])(
    "uses the inclusive 180-day threshold for %s", async (status) => {
      const db = new FakeSupabase();
      addShow(db, 1, status, syncedAgo(180 * DAY + 1));
      addShow(db, 2, status, syncedAgo(180 * DAY));
      addShow(db, 3, status, syncedAgo(180 * DAY - 1));
      addShow(db, 4, status, syncedAgo(179 * DAY));
      expect((await getMetadataRefreshCandidates(client(db), { now: NOW })).map((row) => row.tmdbId)).toEqual([1, 2]);
    },
  );

  it("orders by the oldest due time then ID regardless of lifecycle or input order", async () => {
    const db = new FakeSupabase();
    addShow(db, 90, "Ended", syncedAgo(240 * DAY));
    addShow(db, 30, "Ended", null);
    addShow(db, 20, "Returning Series", null);
    addShow(db, 10, null, null);
    addShow(db, 70, "Returning Series", syncedAgo(6 * DAY));
    addShow(db, 60, "Returning Series", syncedAgo(6 * DAY));
    addShow(db, 50, "Unknown", syncedAgo(7 * DAY));
    addShow(db, 80, "Canceled", syncedAgo(181 * DAY));
    const expectedIds = [10, 20, 30, 90, 50, 60, 70, 80];
    const select = () => getMetadataRefreshCandidates(client(db), { now: NOW, batchSize: 10 });

    expect((await select()).map((row) => row.tmdbId)).toEqual(expectedIds);
    db.userShows.reverse();
    db.shows.reverse();
    expect((await select()).map((row) => row.tmdbId)).toEqual(expectedIds);
  });

  it.each([
    [undefined, 25], [1, 1], [10, 10], [25, 25], [100, 25], [0, 25], [-1, 25], [1.5, 25], [NaN, 25], [Infinity, 25], ["3", 25], [null, 25],
  ])("normalizes batch size %s to %s", async (batchSize, expected) => {
    const db = new FakeSupabase();
    for (let id = 1; id <= 40; id++) addShow(db, id);
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
      { tmdbId: 1101, lastSyncedAt: null, tmdbStatus: "Returning Series", metadata: {} },
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
      addShow(db, 1, null, syncedAgo(5 * DAY));
      expect((await getMetadataRefreshCandidates(client(db))).map((row) => row.tmdbId)).toEqual([1]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("refreshes airing shows on the next UTC day even when fewer than 24 hours have elapsed", async () => {
    const db = new FakeSupabase();
    addShow(db, 1, "Returning Series", "2026-09-08T23:59:59Z");
    addShow(db, 2, "Returning Series", "2026-09-09T00:00:00Z");
    addShow(db, 3, "Returning Series", "2026-09-10T00:00:00Z");
    for (const id of [1, 2, 3]) addAiringEpisode(db, id);
    expect((await getMetadataRefreshCandidates(client(db), { now: NOW })).map((row) => row.tmdbId)).toEqual([1]);
    expect((await getMetadataRefreshCandidates(client(db), { now: new Date("2026-09-10T05:00:00Z") })).map((row) => row.tmdbId)).toEqual([1, 2]);
  });

  it("includes the 14-day recent and seven-day upcoming boundaries, and ignores Specials and distant dates", async () => {
    const db = new FakeSupabase();
    for (let id = 1; id <= 6; id++) addShow(db, id, "Returning Series", syncedAgo(DAY));
    addAiringEpisode(db, 1, "2026-08-26");
    addAiringEpisode(db, 2, "2026-09-16");
    addAiringEpisode(db, 3, "2026-08-25");
    addAiringEpisode(db, 4, "2026-09-17");
    addAiringEpisode(db, 5, "2026-09-09", { season_number: 0 });
    addAiringEpisode(db, 6, "2026-09-09", { air_date: null });
    expect((await getMetadataRefreshCandidates(client(db), { now: NOW })).map((row) => row.tmdbId)).toEqual([1, 2]);
  });

  it("keeps recently ended finales eligible daily while older ended shows retain the 180-day interval", async () => {
    const db = new FakeSupabase();
    addShow(db, 1, "Ended", syncedAgo(DAY));
    addShow(db, 2, "Ended", syncedAgo(DAY));
    addAiringEpisode(db, 1, "2026-09-02");
    addAiringEpisode(db, 2, "2026-08-25");
    expect((await getMetadataRefreshCandidates(client(db), { now: NOW })).map((row) => row.tmdbId)).toEqual([1]);
  });

  it.each(["watching", "watched", "watchlist"] as const)("gives daily eligibility to airing demand in %s, independent of watched progress", async (status) => {
    const db = new FakeSupabase();
    addShow(db, 1, "Returning Series", syncedAgo(DAY));
    db.userShows[0].status = status;
    addAiringEpisode(db, 1);
    expect((await getMetadataRefreshCandidates(client(db), { now: NOW })).map((row) => row.tmdbId)).toEqual([1]);
    db.userShows[0].status = "dropped";
    expect(await getMetadataRefreshCandidates(client(db), { now: NOW })).toEqual([]);
  });

  it.each([
    { overview: null }, { overview: " " }, { title: "Episode 1" }, { title: "TBA" }, { runtime_minutes: null },
  ])("prioritizes incomplete aired details when airing shows became due together: %j", async (overrides) => {
    const db = new FakeSupabase();
    for (const id of [1, 2]) addShow(db, id, "Returning Series", syncedAgo(DAY));
    addAiringEpisode(db, 1);
    addAiringEpisode(db, 2, "2026-09-09", overrides);
    expect((await getMetadataRefreshCandidates(client(db), { now: NOW })).map((row) => row.tmdbId)).toEqual([2, 1]);
  });

  it("keeps older daily due times ahead of incomplete details and does not prioritize future placeholders", async () => {
    const db = new FakeSupabase();
    addShow(db, 1, "Returning Series", syncedAgo(2 * DAY));
    addShow(db, 2, "Returning Series", syncedAgo(DAY));
    addShow(db, 3, "Returning Series", syncedAgo(DAY));
    addAiringEpisode(db, 1);
    addAiringEpisode(db, 2, "2026-09-16", { title: "Episode 1", overview: null });
    addAiringEpisode(db, 3, "2026-09-09", { overview: null });
    expect((await getMetadataRefreshCandidates(client(db), { now: NOW })).map((row) => row.tmdbId)).toEqual([1, 3, 2]);
  });

  it("interleaves twenty airing slots with five background slots and fills unused capacity", async () => {
    const db = new FakeSupabase();
    for (let id = 1; id <= 40; id++) {
      addShow(db, id, "Returning Series", syncedAgo(10 * DAY));
      if (id <= 30) addAiringEpisode(db, id);
    }
    const selected = (await getMetadataRefreshCandidates(client(db), { now: NOW })).map((row) => row.tmdbId);
    expect(selected).toHaveLength(25);
    expect(selected.filter((id) => id <= 30)).toHaveLength(20);
    expect(selected.filter((id) => id > 30)).toEqual([31, 32, 33, 34, 35]);
    expect([4, 9, 14, 19, 24].map((index) => selected[index])).toEqual([31, 32, 33, 34, 35]);
    db.userShows = db.userShows.filter((row) => row.show_tmdb_id <= 30);
    expect((await getMetadataRefreshCandidates(client(db), { now: NOW })).map((row) => row.tmdbId)).toEqual(Array.from({ length: 25 }, (_, index) => index + 1));
  });

  it("honors retry backoff for airing shows without delaying healthy daily work", async () => {
    const db = new FakeSupabase();
    for (const id of [1, 2]) {
      addShow(db, id, "Returning Series", syncedAgo(2 * DAY));
      addAiringEpisode(db, id);
    }
    db.shows[0].metadata = { scheduledRefreshRetry: { failureCount: 1, retryAt: new Date(NOW.getTime() + 1).toISOString() } };
    expect((await getMetadataRefreshCandidates(client(db), { now: NOW })).map((row) => row.tmdbId)).toEqual([2]);
  });

  it("paginates airing signals and fails closed if their reads fail", async () => {
    const db = new FakeSupabase();
    db.rowCap = 1;
    for (const id of [1, 2, 3]) {
      addShow(db, id, "Returning Series", syncedAgo(DAY));
      addAiringEpisode(db, id);
    }
    expect((await getMetadataRefreshCandidates(client(db), { now: NOW })).map((row) => row.tmdbId)).toEqual([1, 2, 3]);
    const airingReadIndex = db.calls.findIndex((call) => call.table === "episodes");
    db.calls = [];
    db.failCall = airingReadIndex + 1;
    await expect(getMetadataRefreshCandidates(client(db), { now: NOW })).rejects.toThrow("airing dates");
  });

  it("gives healthy candidates a turn despite five permanent failures, including interrupted attempts", async () => {
    vi.useFakeTimers();
    try {
      const db = new FakeSupabase();
      for (let id = 1; id <= 10; id++) addShow(db, id);
      const successful = new Set<number>();
      for (let day = 0; day < 60; day++) {
        const now = new Date(NOW.getTime() + day * DAY);
        vi.setSystemTime(now);
        const control = createScheduledTmdbRequestControl(now.getTime() + 240_000);
        const candidates = await getMetadataRefreshCandidates(client(db), { now, control, batchSize: 5 });
        if (day === 1) expect(candidates.map((row) => row.tmdbId)).toEqual([6, 7, 8, 9, 10]);
        for (const candidate of candidates) {
          await beginScheduledMetadataRefresh(candidate, client(db), control);
          // IDs 1-5 fail or terminate after reservation: no post-failure writes.
          if (candidate.tmdbId <= 5) continue;
          successful.add(candidate.tmdbId);
          const show = db.shows.find((row) => row.tmdb_id === candidate.tmdbId)!;
          show.last_synced_at = now.toISOString();
          show.metadata = {};
        }
      }
      expect([...successful]).toEqual([6, 7, 8, 9, 10]);
      expect(db.shows.slice(0, 5).every((row) => row.last_synced_at === null)).toBe(true);
    } finally { vi.useRealTimers(); }
  });

  it("refreshes overdue ended shows alongside twenty-five successful active shows over a year", async () => {
    const db = new FakeSupabase();
    for (let id = 1; id <= 25; id++) addShow(db, id, "Returning Series", syncedAgo(5 * DAY));
    addShow(db, 26, "Ended", syncedAgo(181 * DAY));
    const endedDays: number[] = [];
    for (let day = 0; day < 365; day++) {
      const now = new Date(NOW.getTime() + day * DAY);
      for (const candidate of await getMetadataRefreshCandidates(client(db), { now })) {
        if (candidate.tmdbId === 26) endedDays.push(day);
        db.shows.find((row) => row.tmdb_id === candidate.tmdbId)!.last_synced_at = now.toISOString();
      }
    }
    expect(endedDays[0]).toBe(0);
    expect(endedDays.length).toBeGreaterThanOrEqual(2);
    expect(endedDays[1] - endedDays[0]).toBeLessThanOrEqual(181);
  });

  it("honors retry eligibility at equality and ranks retries behind shows overdue for longer", async () => {
    const db = new FakeSupabase();
    for (let id = 1; id <= 4; id++) addShow(db, id);
    db.shows[0].metadata = { scheduledRefreshRetry: { failureCount: 1, retryAt: new Date(NOW.getTime() + 1).toISOString() } };
    db.shows[1].metadata = { scheduledRefreshRetry: { failureCount: 1, retryAt: NOW.toISOString() } };
    db.shows[2].metadata = { scheduledRefreshRetry: { failureCount: 2, retryAt: syncedAgo(DAY) } };
    expect((await getMetadataRefreshCandidates(client(db), { now: NOW })).map((row) => row.tmdbId)).toEqual([4, 3, 2]);
  });

  it.each(["user_shows", "shows"] as const)("aborts stalled %s selection through the real Supabase transport", async (stalledTable) => {
    vi.useFakeTimers();
    try {
      vi.spyOn(AbortSignal, "timeout").mockImplementation((ms) => {
        const controller = new AbortController();
        setTimeout(() => controller.abort(), ms);
        return controller.signal;
      });
      const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const isEligibility = String(input).includes("/rpc/");
        if (isEligibility && stalledTable === "shows") {
          const start = Number(new URL(String(input)).searchParams.get("offset") ?? 0);
          return Response.json(start === 0 ? [{ show_tmdb_id: 1 }] : []);
        }
        return new Promise<Response>((_resolve, reject) => {
          if (init!.signal!.aborted) return reject(init!.signal!.reason);
          init!.signal!.addEventListener("abort", () => reject(init!.signal!.reason), { once: true });
        });
      });
      const metadataClient = createClient<Database>("https://test.supabase.co", "test-key", {
        auth: { persistSession: false, autoRefreshToken: false }, global: { fetch },
      });
      const pending = getMetadataRefreshCandidates(metadataClient, { now: NOW }).catch((error) => error);
      await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(stalledTable === "shows" ? 3 : 1));
      await vi.advanceTimersByTimeAsync(10_000);
      expect(await pending).toBeInstanceOf(MetadataRefreshCandidateError);
      expect(fetch.mock.calls.at(-1)![1]!.signal!.aborted).toBe(true);
      expect(fetch).toHaveBeenCalledTimes(stalledTable === "shows" ? 3 : 1);
    } finally {
      vi.useRealTimers();
      vi.restoreAllMocks();
    }
  });

  it("stops pagination at the shared deadline even when every individual query completes", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(NOW);
      const db = new FakeSupabase();
      db.rowCap = 1;
      for (let id = 1; id <= 100; id++) addShow(db, id);
      db.onRead = () => { vi.setSystemTime(Date.now() + 9_000); };
      const control = createScheduledTmdbRequestControl(NOW.getTime() + 240_000);
      await expect(getMetadataRefreshCandidates(client(db), { now: NOW, control })).rejects.toThrow("time budget");
      expect(db.calls).toHaveLength(25);
      expect(db.calls.every((call) => call.table === "user_shows")).toBe(true);
    } finally { vi.useRealTimers(); }
  });
});

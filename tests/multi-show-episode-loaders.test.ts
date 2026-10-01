import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import {
  loadEpisodeProgressByShowIds,
  loadEpisodeSummariesByShowIds,
  loadEpisodesByShowIds,
  loadWatchedEpisodesByShowIds,
  MULTI_SHOW_EPISODE_CONCURRENCY,
  MULTI_SHOW_EPISODE_PAGE_SIZE,
} from "../features/tracking";
import type { Database } from "../lib/supabase/types";

type EpisodeRow = Database["public"]["Tables"]["episodes"]["Row"];
type WatchedEpisodeRow = Database["public"]["Tables"]["watched_episodes"]["Row"];
type TableName = "episodes" | "watched_episodes";
type RowByTable<TTable extends TableName> = TTable extends "episodes" ? EpisodeRow : WatchedEpisodeRow;
type QueryFilter =
  | {
    column: string;
    kind: "eq";
    value: unknown;
  }
  | {
    column: string;
    kind: "in";
    values: unknown[];
  };

type QueryCall = {
  columns: string;
  countRequested: boolean;
  filters: QueryFilter[];
  orders: string[];
  rangeEnd: number;
  rangeStart: number;
  table: TableName;
};

class FakeSupabase {
  readonly calls: QueryCall[] = [];
  episodes: EpisodeRow[] = [];
  watchedEpisodes: WatchedEpisodeRow[] = [];
  includeCount = true;
  rowLimit = MULTI_SHOW_EPISODE_PAGE_SIZE;
  respond?: (call: QueryCall) => Promise<void>;
  failedRange: number | null = null;
  truncatedRange: number | null = null;

  from<TTable extends TableName>(table: TTable) {
    return new FakeQuery<TTable>(this, table);
  }

  getRows<TTable extends TableName>(table: TTable): RowByTable<TTable>[] {
    return (table === "episodes" ? this.episodes : this.watchedEpisodes) as RowByTable<TTable>[];
  }
}

class FakeQuery<TTable extends TableName> {
  private columns = "*";
  private countRequested = false;
  private readonly filters: QueryFilter[] = [];
  private readonly orderColumns: string[] = [];

  constructor(
    private readonly db: FakeSupabase,
    private readonly table: TTable,
  ) {}

  eq(column: string, value: unknown) {
    this.filters.push({ column, kind: "eq", value });
    return this;
  }

  in(column: string, values: unknown[]) {
    this.filters.push({ column, kind: "in", values });
    return this;
  }

  order(column: string) {
    this.orderColumns.push(column);
    return this;
  }

  async range(rangeStart: number, rangeEnd: number) {
    const call = {
      columns: this.columns,
      countRequested: this.countRequested,
      filters: [...this.filters],
      orders: [...this.orderColumns],
      rangeEnd,
      rangeStart,
      table: this.table,
    };
    this.db.calls.push(call);

    const allRows = this.db
      .getRows(this.table)
      .filter((row) => matchesFilters(row, this.filters))
      .sort((left, right) => compareRows(left, right, this.orderColumns));
    const rows = this.db.truncatedRange === rangeStart ? [] : allRows.slice(rangeStart, Math.min(rangeEnd + 1, rangeStart + this.db.rowLimit));
    await this.db.respond?.(call);

    return {
      count: this.countRequested && this.db.includeCount ? allRows.length : null,
      data: this.db.failedRange === rangeStart ? null : rows.map((row) =>
        Object.fromEntries(this.columns.split(",").map((column) => [column, getColumnValue(row, column)])),
      ),
      error: this.db.failedRange === rangeStart ? { message: "Request failed" } : null,
    };
  }

  select(columns: string, options: { count?: string } = {}) {
    this.columns = columns;
    this.countRequested = options.count === "exact";
    return this;
  }
}

function client(db: FakeSupabase): SupabaseClient<Database> {
  return db as unknown as SupabaseClient<Database>;
}

function episodeRow(showTmdbId: number, seasonNumber: number, episodeNumber: number): EpisodeRow {
  return {
    air_date: "2026-01-01",
    created_at: "2026-01-01T00:00:00.000Z",
    episode_key: `${showTmdbId}:${seasonNumber}:${episodeNumber}`,
    episode_number: episodeNumber,
    id: showTmdbId * 100000 + seasonNumber * 1000 + episodeNumber,
    last_synced_at: "2026-01-02T00:00:00.000Z",
    metadata: { source: "fixture" },
    overview: `Overview ${showTmdbId}-${seasonNumber}-${episodeNumber}`,
    runtime_minutes: 42,
    season_number: seasonNumber,
    show_tmdb_id: showTmdbId,
    still_path: `/still-${showTmdbId}-${seasonNumber}-${episodeNumber}.jpg`,
    title: `Show ${showTmdbId} S${seasonNumber}E${episodeNumber}`,
    tmdb_id: showTmdbId * 1000000 + seasonNumber * 1000 + episodeNumber,
    updated_at: "2026-01-03T00:00:00.000Z",
  };
}

function watchedEpisodeRow(
  showTmdbId: number,
  seasonNumber: number,
  episodeNumber: number,
  userId = "user-1",
): WatchedEpisodeRow {
  return {
    created_at: "2026-01-01T00:00:00.000Z",
    episode_key: `${showTmdbId}:${seasonNumber}:${episodeNumber}`,
    episode_number: episodeNumber,
    id: showTmdbId * 100000 + seasonNumber * 1000 + episodeNumber,
    season_number: seasonNumber,
    show_tmdb_id: showTmdbId,
    user_id: userId,
    watched_at: "2026-01-04T00:00:00.000Z",
  };
}

function getColumnValue(row: object, column: string) {
  return (row as Record<string, unknown>)[column];
}

function matchesFilters(row: object, filters: QueryFilter[]) {
  return filters.every((filter) => {
    const value = getColumnValue(row, filter.column);

    if (filter.kind === "eq") {
      return value === filter.value;
    }

    return filter.values.includes(value);
  });
}

function compareRows(left: object, right: object, orderColumns: string[]) {
  for (const column of orderColumns) {
    const leftValue = getColumnValue(left, column);
    const rightValue = getColumnValue(right, column);

    if (typeof leftValue === "number" && typeof rightValue === "number" && leftValue !== rightValue) {
      return leftValue - rightValue;
    }
  }

  return 0;
}

describe("multi-show episode loaders", () => {
  it.each(["progress", "summary"] as const)("loads complete compact %s data without descriptions or metadata", async (kind) => {
    const db = new FakeSupabase();
    db.episodes = Array.from({ length: 1001 }, (_, index) => episodeRow(1, 1, index + 1));
    const episodes = kind === "progress"
      ? await loadEpisodeProgressByShowIds(client(db), [1])
      : await loadEpisodeSummariesByShowIds(client(db), [1]);
    expect(episodes.get(1)).toHaveLength(1001);
    expect(episodes.get(1)?.at(-1)).toEqual({
      airDate: "2026-01-01",
      episodeNumber: 1001,
      seasonNumber: 1,
      showTmdbId: 1,
      ...(kind === "summary" ? { title: "Show 1 S1E1001" } : {}),
    });
    for (const call of db.calls) {
      expect(call.columns.split(",")).toEqual([
        "air_date", "episode_number", "season_number", "show_tmdb_id",
        ...(kind === "summary" ? ["title"] : []),
      ]);
    }
  });

  it("stops scheduling new pages after a failure", async () => {
    const db = new FakeSupabase();
    db.episodes = Array.from({ length: 8001 }, (_, index) => episodeRow(1, 1, index + 1));
    db.failedRange = 1000;
    db.respond = async (call) => {
      if (call.rangeStart > 1000) await new Promise((resolve) => setTimeout(resolve, 10));
    };
    await expect(loadEpisodesByShowIds(client(db), [1])).rejects.toThrow("Unable to load");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(db.calls.map((call) => call.rangeStart)).toEqual([0, 1000, 2000, 3000]);
  });

  it("reads only fields used by the domain, preserving episode descriptions", async () => {
    const db = new FakeSupabase();
    db.episodes = [episodeRow(1, 1, 1)];
    db.watchedEpisodes = [watchedEpisodeRow(1, 1, 1)];
    const episodes = await loadEpisodesByShowIds(client(db), [1]);
    await loadWatchedEpisodesByShowIds(client(db), "user-1", [1]);
    for (const call of db.calls) {
      expect(call.columns).not.toContain("*");
      expect(call.columns.split(",")).not.toContain("metadata");
      expect(call.columns.split(",")).not.toContain("created_at");
    }
    expect(episodes.get(1)?.[0].overview).toBe("Overview 1-1-1");
  });

  it.each(["episodes", "watched_episodes"] as const)("bounds concurrent %s reads and restores range order", async (table) => {
    const db = new FakeSupabase();
    const size = MULTI_SHOW_EPISODE_PAGE_SIZE * 6 + 1;
    db.episodes = Array.from({ length: size }, (_, index) => episodeRow(1, 1, index + 1));
    db.watchedEpisodes = Array.from({ length: size }, (_, index) => watchedEpisodeRow(1, 1, index + 1));
    let active = 0;
    let maxActive = 0;
    db.respond = async (call) => {
      active++;
      maxActive = Math.max(maxActive, active);
      // Later ranges deliberately finish first.
      await new Promise((resolve) => setTimeout(resolve, call.rangeStart === 1000 ? 20 : 1));
      active--;
    };
    const grouped = table === "episodes"
      ? await loadEpisodesByShowIds(client(db), [1, 1])
      : await loadWatchedEpisodesByShowIds(client(db), "user-1", [1, 1]);
    expect(maxActive).toBe(MULTI_SHOW_EPISODE_CONCURRENCY);
    expect(grouped.get(1)?.map((row) => row.episodeNumber)).toEqual(Array.from({ length: size }, (_, index) => index + 1));
    expect(db.calls).toHaveLength(7);
    expect(db.calls.filter((call) => call.countRequested)).toHaveLength(1);
    if (table === "watched_episodes") {
      expect(db.calls.every((call) => call.filters.some((filter) => filter.kind === "eq" && filter.column === "user_id" && filter.value === "user-1"))).toBe(true);
    }
  });

  it("uses a lower API row limit without losing rows", async () => {
    const db = new FakeSupabase();
    db.rowLimit = 250;
    db.episodes = Array.from({ length: 1051 }, (_, index) => episodeRow(1, 1, index + 1));
    const episodes = await loadEpisodesByShowIds(client(db), [1]);
    expect(episodes.get(1)).toHaveLength(1051);
    expect(db.calls.map((call) => call.rangeStart)).toEqual([0, 250, 500, 750, 1000]);
  });

  it("falls back to complete pagination when the count is unavailable", async () => {
    const db = new FakeSupabase();
    db.includeCount = false;
    db.episodes = Array.from({ length: 2001 }, (_, index) => episodeRow(1, 1, index + 1));
    expect((await loadEpisodesByShowIds(client(db), [1])).get(1)).toHaveLength(2001);
    expect(db.calls.map((call) => call.rangeStart)).toEqual([0, 1000, 2000]);
  });

  it("keeps all rows when both count is missing and the API limit is below 1,000", async () => {
    const db = new FakeSupabase();
    db.includeCount = false;
    db.rowLimit = 250;
    db.episodes = Array.from({ length: 1001 }, (_, index) => episodeRow(1, 1, index + 1));
    expect((await loadEpisodeProgressByShowIds(client(db), [1])).get(1)).toHaveLength(1001);
    expect(db.calls.map((call) => call.rangeStart)).toEqual([0, 250, 500, 750, 1000]);
  });

  it.each([0, 1000, 2000])("rejects missing rows at offset %s even when the API reports success", async (rangeStart) => {
    const db = new FakeSupabase();
    db.episodes = Array.from({ length: 2001 }, (_, index) => episodeRow(1, 1, index + 1));
    db.truncatedRange = rangeStart;
    await expect(loadEpisodeSummariesByShowIds(client(db), [1])).rejects.toThrow("Unable to load episodes.");
  });

  it.each(["episodes", "watched_episodes"] as const)("rejects a failed later %s page instead of returning partial progress", async (table) => {
    const db = new FakeSupabase();
    db.episodes = Array.from({ length: 2001 }, (_, index) => episodeRow(1, 1, index + 1));
    db.watchedEpisodes = Array.from({ length: 2001 }, (_, index) => watchedEpisodeRow(1, 1, index + 1));
    db.failedRange = 1000;
    const result = table === "episodes"
      ? loadEpisodesByShowIds(client(db), [1])
      : loadWatchedEpisodesByShowIds(client(db), "user-1", [1]);
    await expect(result).rejects.toThrow("Unable to load");
  });

  it("returns empty grouped results for empty show ID input", async () => {
    const db = new FakeSupabase();

    await expect(loadEpisodesByShowIds(client(db), [])).resolves.toEqual(new Map());
    await expect(loadWatchedEpisodesByShowIds(client(db), "user-1", [])).resolves.toEqual(new Map());
    await expect(loadEpisodeProgressByShowIds(client(db), [])).resolves.toEqual(new Map());
    await expect(loadEpisodeSummariesByShowIds(client(db), [])).resolves.toEqual(new Map());
    expect(db.calls).toEqual([]);
  });

  it("loads episode rows across multiple pages and includes rows after the first page", async () => {
    const db = new FakeSupabase();
    db.episodes = Array.from({ length: MULTI_SHOW_EPISODE_PAGE_SIZE + 1 }, (_, index) =>
      episodeRow(1, 1, index + 1),
    );

    const groupedEpisodes = await loadEpisodesByShowIds(client(db), [1]);

    expect(groupedEpisodes.get(1)).toHaveLength(MULTI_SHOW_EPISODE_PAGE_SIZE + 1);
    expect(groupedEpisodes.get(1)?.at(-1)).toMatchObject({
      episodeNumber: MULTI_SHOW_EPISODE_PAGE_SIZE + 1,
      seasonNumber: 1,
      showTmdbId: 1,
    });
    expect(db.calls.map((call) => [call.rangeStart, call.rangeEnd])).toEqual([
      [0, MULTI_SHOW_EPISODE_PAGE_SIZE - 1],
      [MULTI_SHOW_EPISODE_PAGE_SIZE, MULTI_SHOW_EPISODE_PAGE_SIZE * 2 - 1],
    ]);
    expect(db.calls[0]?.orders).toEqual(["show_tmdb_id", "season_number", "episode_number"]);
  });

  it("groups mapped episodes by show TMDB ID", async () => {
    const db = new FakeSupabase();
    db.episodes = [
      episodeRow(2, 1, 1),
      episodeRow(1, 1, 1),
      episodeRow(2, 1, 2),
      episodeRow(1, 1, 2),
    ];

    const groupedEpisodes = await loadEpisodesByShowIds(client(db), [1, 2]);

    expect(Array.from(groupedEpisodes.keys())).toEqual([1, 2]);
    expect(groupedEpisodes.get(1)?.map((episode) => episode.episodeNumber)).toEqual([1, 2]);
    expect(groupedEpisodes.get(2)?.map((episode) => episode.episodeNumber)).toEqual([1, 2]);
  });

  it("maps episode snake_case fields to camelCase domain fields", async () => {
    const db = new FakeSupabase();
    db.episodes = [episodeRow(10, 2, 3)];

    const groupedEpisodes = await loadEpisodesByShowIds(client(db), [10]);

    expect(groupedEpisodes.get(10)?.[0]).toEqual({
      airDate: "2026-01-01",
      episodeNumber: 3,
      metadata: {},
      overview: "Overview 10-2-3",
      runtimeMinutes: 42,
      seasonNumber: 2,
      showTmdbId: 10,
      stillPath: "/still-10-2-3.jpg",
      title: "Show 10 S2E3",
      tmdbId: 10002003,
    });
  });

  it("loads watched episode rows across multiple pages and groups them by show TMDB ID", async () => {
    const db = new FakeSupabase();
    db.watchedEpisodes = Array.from({ length: MULTI_SHOW_EPISODE_PAGE_SIZE + 1 }, (_, index) =>
      watchedEpisodeRow(index < MULTI_SHOW_EPISODE_PAGE_SIZE ? 1 : 2, 1, index + 1),
    );

    const groupedWatchedEpisodes = await loadWatchedEpisodesByShowIds(client(db), "user-1", [1, 2]);

    expect(groupedWatchedEpisodes.get(1)).toHaveLength(MULTI_SHOW_EPISODE_PAGE_SIZE);
    expect(groupedWatchedEpisodes.get(2)).toHaveLength(1);
    expect(groupedWatchedEpisodes.get(2)?.[0]).toMatchObject({
      episodeNumber: MULTI_SHOW_EPISODE_PAGE_SIZE + 1,
      seasonNumber: 1,
      showTmdbId: 2,
      userId: "user-1",
    });
    expect(db.calls.map((call) => [call.rangeStart, call.rangeEnd])).toEqual([
      [0, MULTI_SHOW_EPISODE_PAGE_SIZE - 1],
      [MULTI_SHOW_EPISODE_PAGE_SIZE, MULTI_SHOW_EPISODE_PAGE_SIZE * 2 - 1],
    ]);
    expect(db.calls[0]?.orders).toEqual(["show_tmdb_id", "season_number", "episode_number"]);
  });

  it("maps watched episode snake_case fields to camelCase domain fields", async () => {
    const db = new FakeSupabase();
    db.watchedEpisodes = [watchedEpisodeRow(11, 4, 5)];

    const groupedWatchedEpisodes = await loadWatchedEpisodesByShowIds(client(db), "user-1", [11]);

    expect(groupedWatchedEpisodes.get(11)?.[0]).toEqual({
      episodeNumber: 5,
      id: 1104005,
      seasonNumber: 4,
      showTmdbId: 11,
      userId: "user-1",
      watchedAt: "2026-01-04T00:00:00.000Z",
    });
  });
});

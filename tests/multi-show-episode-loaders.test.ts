import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import {
  loadEpisodesByShowIds,
  loadWatchedEpisodesByShowIds,
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

  from<TTable extends TableName>(table: TTable) {
    return new FakeQuery<TTable>(this, table);
  }

  getRows<TTable extends TableName>(table: TTable): RowByTable<TTable>[] {
    return (table === "episodes" ? this.episodes : this.watchedEpisodes) as RowByTable<TTable>[];
  }
}

class FakeQuery<TTable extends TableName> {
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

  range(rangeStart: number, rangeEnd: number) {
    this.db.calls.push({
      filters: [...this.filters],
      orders: [...this.orderColumns],
      rangeEnd,
      rangeStart,
      table: this.table,
    });

    const rows = this.db
      .getRows(this.table)
      .filter((row) => matchesFilters(row, this.filters))
      .sort((left, right) => compareRows(left, right, this.orderColumns))
      .slice(rangeStart, rangeEnd + 1);

    return Promise.resolve({
      data: rows,
      error: null,
    });
  }

  select() {
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
  it("returns empty grouped results for empty show ID input", async () => {
    const db = new FakeSupabase();

    await expect(loadEpisodesByShowIds(client(db), [])).resolves.toEqual(new Map());
    await expect(loadWatchedEpisodesByShowIds(client(db), "user-1", [])).resolves.toEqual(new Map());
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

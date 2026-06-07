import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { getUserDashboardData } from "../features/dashboard/data";
import { MULTI_SHOW_EPISODE_PAGE_SIZE } from "../features/tracking";
import type { Database } from "../lib/supabase/types";

type EpisodeRow = Database["public"]["Tables"]["episodes"]["Row"];
type ShowRow = Database["public"]["Tables"]["shows"]["Row"];
type UserShowRow = Database["public"]["Tables"]["user_shows"]["Row"];
type WatchedEpisodeRow = Database["public"]["Tables"]["watched_episodes"]["Row"];
type TableName = "episodes" | "shows" | "user_shows" | "watched_episodes";
type AnyRow = EpisodeRow | ShowRow | UserShowRow | WatchedEpisodeRow;
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
type QueryOrder = {
  ascending: boolean;
  column: string;
};
type QueryResponse = {
  data: AnyRow[] | null;
  error: null;
};

const USER_ID = "user-1";

class FakeSupabase {
  episodes: EpisodeRow[] = [];
  shows: ShowRow[] = [];
  userShows: UserShowRow[] = [];
  watchedEpisodes: WatchedEpisodeRow[] = [];

  from(table: TableName) {
    return new FakeQuery(this, table);
  }

  getRows(table: TableName): AnyRow[] {
    if (table === "episodes") return this.episodes;
    if (table === "shows") return this.shows;
    if (table === "user_shows") return this.userShows;

    return this.watchedEpisodes;
  }
}

class FakeQuery {
  private readonly filters: QueryFilter[] = [];
  private readonly orders: QueryOrder[] = [];

  constructor(
    private readonly db: FakeSupabase,
    private readonly table: TableName,
  ) {}

  eq(column: string, value: unknown) {
    this.filters.push({ column, kind: "eq", value });
    return this;
  }

  in(column: string, values: unknown[]) {
    this.filters.push({ column, kind: "in", values });
    return this;
  }

  order(column: string, options: { ascending?: boolean } = {}) {
    this.orders.push({ ascending: options.ascending ?? true, column });
    return this;
  }

  range(rangeStart: number, rangeEnd: number) {
    return Promise.resolve(this.execute(rangeStart, rangeEnd));
  }

  select() {
    return this;
  }

  then<TResult1 = QueryResponse, TResult2 = never>(
    onfulfilled?: ((value: QueryResponse) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
  }

  private execute(rangeStart?: number, rangeEnd?: number): QueryResponse {
    let rows = this.db.getRows(this.table).filter((row) => matchesFilters(row, this.filters));

    if (this.orders.length > 0) {
      rows = [...rows].sort((left, right) => compareRows(left, right, this.orders));
    }

    if (rangeStart !== undefined && rangeEnd !== undefined) {
      rows = rows.slice(rangeStart, rangeEnd + 1);
    }

    return { data: rows, error: null };
  }
}

function client(db: FakeSupabase): SupabaseClient<Database> {
  return db as unknown as SupabaseClient<Database>;
}

function showRow(tmdbId: number, title: string, tmdbStatus: string | null = "Returning Series"): ShowRow {
  return {
    backdrop_path: null,
    created_at: "2026-01-01T00:00:00.000Z",
    first_air_date: "2026-01-01",
    genres: [],
    last_air_date: null,
    last_synced_at: "2026-01-02T00:00:00.000Z",
    metadata: {},
    original_language: "en",
    original_title: title,
    overview: null,
    popularity: null,
    poster_path: null,
    title,
    tmdb_id: tmdbId,
    tmdb_status: tmdbStatus,
    updated_at: "2026-01-03T00:00:00.000Z",
    vote_average: null,
    vote_count: null,
  };
}

function userShowRow(showTmdbId: number, addedAt = "2026-02-01T00:00:00.000Z"): UserShowRow {
  return {
    added_at: addedAt,
    created_at: addedAt,
    favourite: false,
    id: showTmdbId,
    show_tmdb_id: showTmdbId,
    status: "watchlist",
    status_updated_at: addedAt,
    updated_at: addedAt,
    user_id: USER_ID,
  };
}

function episodeRow(
  showTmdbId: number,
  seasonNumber: number,
  episodeNumber: number,
  airDate = "2026-01-01",
): EpisodeRow {
  return {
    air_date: airDate,
    created_at: "2026-01-01T00:00:00.000Z",
    episode_key: `${showTmdbId}:${seasonNumber}:${episodeNumber}`,
    episode_number: episodeNumber,
    id: showTmdbId * 100000 + seasonNumber * 1000 + episodeNumber,
    last_synced_at: "2026-01-02T00:00:00.000Z",
    metadata: {},
    overview: null,
    runtime_minutes: null,
    season_number: seasonNumber,
    show_tmdb_id: showTmdbId,
    still_path: null,
    title: `S${seasonNumber}E${episodeNumber}`,
    tmdb_id: showTmdbId * 1000000 + seasonNumber * 1000 + episodeNumber,
    updated_at: "2026-01-03T00:00:00.000Z",
  };
}

function watchedEpisodeRow(showTmdbId: number, seasonNumber: number, episodeNumber: number): WatchedEpisodeRow {
  return {
    created_at: "2026-01-01T00:00:00.000Z",
    episode_key: `${showTmdbId}:${seasonNumber}:${episodeNumber}`,
    episode_number: episodeNumber,
    id: showTmdbId * 100000 + seasonNumber * 1000 + episodeNumber,
    season_number: seasonNumber,
    show_tmdb_id: showTmdbId,
    user_id: USER_ID,
    watched_at: "2026-01-04T00:00:00.000Z",
  };
}

function addShow(
  db: FakeSupabase,
  {
    addedAt,
    episodes,
    show,
    watchedEpisodes = [],
  }: {
    addedAt?: string;
    episodes: EpisodeRow[];
    show: ShowRow;
    watchedEpisodes?: WatchedEpisodeRow[];
  },
) {
  db.shows.push(show);
  db.userShows.push(userShowRow(show.tmdb_id, addedAt));
  db.episodes.push(...episodes);
  db.watchedEpisodes.push(...watchedEpisodes);
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

function compareRows(left: object, right: object, orders: QueryOrder[]) {
  for (const order of orders) {
    const leftValue = getColumnValue(left, order.column);
    const rightValue = getColumnValue(right, order.column);

    if (leftValue === rightValue) {
      continue;
    }

    if (typeof leftValue === "number" && typeof rightValue === "number") {
      return order.ascending ? leftValue - rightValue : rightValue - leftValue;
    }

    if (typeof leftValue === "string" && typeof rightValue === "string") {
      return order.ascending ? leftValue.localeCompare(rightValue) : rightValue.localeCompare(leftValue);
    }
  }

  return 0;
}

function watchedRowsFor(episodes: EpisodeRow[]) {
  return episodes.map((episode) =>
    watchedEpisodeRow(episode.show_tmdb_id, episode.season_number, episode.episode_number),
  );
}

describe("dashboard data loading", () => {
  it("does not put completed or caught-up shows in Start Watching when rows are after a pagination boundary", async () => {
    const db = new FakeSupabase();
    const fillerEpisodes = Array.from({ length: MULTI_SHOW_EPISODE_PAGE_SIZE }, (_, index) =>
      episodeRow(1, 1, index + 1),
    );
    const completedEpisodes = Array.from({ length: 8 }, (_, index) => episodeRow(2, 1, index + 1));
    const caughtUpEpisodes = Array.from({ length: 84 }, (_, index) => episodeRow(3, 1, index + 1));

    addShow(db, {
      addedAt: "2026-02-01T00:00:00.000Z",
      episodes: fillerEpisodes,
      show: showRow(1, "Long-running filler"),
      watchedEpisodes: fillerEpisodes.slice(0, 1).map((episode) =>
        watchedEpisodeRow(episode.show_tmdb_id, episode.season_number, episode.episode_number),
      ),
    });
    addShow(db, {
      addedAt: "2026-02-02T00:00:00.000Z",
      episodes: completedEpisodes,
      show: showRow(2, "Completed Boundary Show", "Ended"),
      watchedEpisodes: watchedRowsFor(completedEpisodes),
    });
    addShow(db, {
      addedAt: "2026-02-03T00:00:00.000Z",
      episodes: caughtUpEpisodes,
      show: showRow(3, "Caught Up Boundary Show"),
      watchedEpisodes: watchedRowsFor(caughtUpEpisodes),
    });

    const dashboard = await getUserDashboardData(client(db), USER_ID);

    expect(dashboard.startWatching.map((item) => item.tmdbId)).toEqual([]);
    expect(dashboard.summary.completedCount).toBe(1);
    expect(dashboard.summary.caughtUpCount).toBe(1);
  });

  it("uses complete episode and watched data for Continue Watching", async () => {
    const db = new FakeSupabase();
    const fillerEpisodes = Array.from({ length: MULTI_SHOW_EPISODE_PAGE_SIZE }, (_, index) =>
      episodeRow(1, 1, index + 1),
    );
    const continueEpisodes = [episodeRow(2, 1, 1), episodeRow(2, 1, 2), episodeRow(2, 1, 3)];

    addShow(db, {
      episodes: fillerEpisodes,
      show: showRow(1, "Long-running filler"),
      watchedEpisodes: watchedRowsFor(fillerEpisodes),
    });
    addShow(db, {
      addedAt: "2026-02-02T00:00:00.000Z",
      episodes: continueEpisodes,
      show: showRow(2, "Continue Boundary Show"),
      watchedEpisodes: [watchedEpisodeRow(2, 1, 1)],
    });

    const dashboard = await getUserDashboardData(client(db), USER_ID);

    expect(dashboard.continueWatching).toHaveLength(1);
    expect(dashboard.continueWatching[0]).toMatchObject({
      tmdbId: 2,
      totalEpisodeCount: 3,
      watchedEpisodeCount: 1,
      nextEpisode: {
        episodeNumber: 2,
        seasonNumber: 1,
      },
    });
  });

  it("uses complete episode data for Upcoming Episodes", async () => {
    const db = new FakeSupabase();
    const fillerEpisodes = Array.from({ length: MULTI_SHOW_EPISODE_PAGE_SIZE }, (_, index) =>
      episodeRow(1, 1, index + 1),
    );
    const upcomingEpisodes = [
      episodeRow(2, 1, 1, "2026-01-01"),
      episodeRow(2, 1, 2, "2099-01-01"),
      episodeRow(2, 1, 3, "2099-02-01"),
    ];

    addShow(db, {
      episodes: fillerEpisodes,
      show: showRow(1, "Long-running filler"),
      watchedEpisodes: watchedRowsFor(fillerEpisodes),
    });
    addShow(db, {
      addedAt: "2026-02-02T00:00:00.000Z",
      episodes: upcomingEpisodes,
      show: showRow(2, "Upcoming Boundary Show"),
      watchedEpisodes: [watchedEpisodeRow(2, 1, 1)],
    });

    const dashboard = await getUserDashboardData(client(db), USER_ID);

    expect(dashboard.upcomingEpisodes).toHaveLength(1);
    expect(dashboard.upcomingEpisodes[0]).toMatchObject({
      airDate: "2099-01-01",
      episodeNumber: 2,
      seasonNumber: 1,
      tmdbId: 2,
    });
  });

  it("uses complete episode and watched data for Start Watching", async () => {
    const db = new FakeSupabase();
    const fillerEpisodes = Array.from({ length: MULTI_SHOW_EPISODE_PAGE_SIZE }, (_, index) =>
      episodeRow(1, 1, index + 1),
    );

    addShow(db, {
      episodes: fillerEpisodes,
      show: showRow(1, "Long-running filler"),
      watchedEpisodes: watchedRowsFor(fillerEpisodes),
    });
    addShow(db, {
      addedAt: "2026-02-02T00:00:00.000Z",
      episodes: [episodeRow(2, 1, 1), episodeRow(2, 1, 2)],
      show: showRow(2, "Start Boundary Show"),
    });

    const dashboard = await getUserDashboardData(client(db), USER_ID);

    expect(dashboard.startWatching).toHaveLength(1);
    expect(dashboard.startWatching[0]).toMatchObject({
      episodeNumber: 1,
      seasonNumber: 1,
      showTitle: "Start Boundary Show",
      tmdbId: 2,
    });
  });

  it("excludes Specials from main dashboard progress and status", async () => {
    const db = new FakeSupabase();

    addShow(db, {
      episodes: [episodeRow(10, 0, 1), episodeRow(10, 1, 1), episodeRow(10, 1, 2)],
      show: showRow(10, "Specials Dashboard Show", "Ended"),
      watchedEpisodes: [watchedEpisodeRow(10, 1, 1), watchedEpisodeRow(10, 1, 2)],
    });

    const dashboard = await getUserDashboardData(client(db), USER_ID);

    expect(dashboard.summary.completedCount).toBe(1);
    expect(dashboard.summary.watchlistCount).toBe(0);
    expect(dashboard.startWatching).toEqual([]);
    expect(dashboard.continueWatching).toEqual([]);
  });
});

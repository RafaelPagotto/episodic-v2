import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { DashboardDataError, getUserDashboardData, getUserDashboardSummary } from "../features/dashboard/data";
import { createDashboardData } from "../features/dashboard/view-model";
import { DEFAULT_USER_PREFERENCES } from "../features/preferences/defaults";
import { mapEpisodeRow, mapWatchedEpisodeRow, MULTI_SHOW_EPISODE_PAGE_SIZE } from "../features/tracking";
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
  count: number | null;
  data: AnyRow[] | null;
  error: { message: string } | null;
};

const USER_ID = "user-1";

class FakeSupabase {
  readonly calls: { columns: string; filters: QueryFilter[]; table: TableName }[] = [];
  episodes: EpisodeRow[] = [];
  shows: ShowRow[] = [];
  userShows: UserShowRow[] = [];
  watchedEpisodes: WatchedEpisodeRow[] = [];
  failedTable: TableName | null = null;
  rowLimit = Number.POSITIVE_INFINITY;

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
  private columns = "*";
  private countRequested = false;
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

  select(columns: string, options: { count?: string } = {}) {
    this.columns = columns;
    this.countRequested = options.count === "exact";
    return this;
  }

  then<TResult1 = QueryResponse, TResult2 = never>(
    onfulfilled?: ((value: QueryResponse) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
  }

  private execute(rangeStart?: number, rangeEnd?: number): QueryResponse {
    this.db.calls.push({ columns: this.columns, filters: [...this.filters], table: this.table });
    if (this.db.failedTable === this.table) return { count: null, data: null, error: { message: "Failed request" } };
    let rows = this.db.getRows(this.table).filter((row) => matchesFilters(row, this.filters));
    const count = this.countRequested ? rows.length : null;

    if (this.orders.length > 0) {
      rows = [...rows].sort((left, right) => compareRows(left, right, this.orders));
    }

    if (rangeStart !== undefined && rangeEnd !== undefined) {
      rows = rows.slice(rangeStart, rangeEnd + 1);
    }
    rows = rows.slice(0, this.db.rowLimit);

    const projected = this.columns === "*" ? rows : rows.map((row) =>
      Object.fromEntries(this.columns.split(",").map((column) => [column, getColumnValue(row, column)])) as AnyRow,
    );
    return { count, data: projected, error: null };
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
  it.each([
    { referenceDate: new Date("2026-07-19T02:30:00.000Z"), timeZone: "America/Sao_Paulo" },
    { referenceDate: new Date("2026-07-19T03:00:00.000Z"), timeZone: "America/Sao_Paulo" },
    { referenceDate: new Date("2026-07-18T10:00:00.000Z"), timeZone: "Pacific/Kiritimati" },
  ])("matches full-record Dashboard results at $referenceDate in $timeZone", async (options) => {
    const db = new FakeSupabase();
    const longEpisodes = Array.from({ length: 3 }, (_, index) => episodeRow(1, 1, index + 1));
    longEpisodes[2].air_date = "2026-07-19";
    addShow(db, { episodes: longEpisodes, show: { ...showRow(1, "Ongoing"), poster_path: "/ongoing.jpg" }, watchedEpisodes: watchedRowsFor(longEpisodes.slice(0, 2)) });
    addShow(db, { episodes: [episodeRow(2, 0, 1), episodeRow(2, 1, 1)], show: showRow(2, "Ended", "Ended"), watchedEpisodes: [watchedEpisodeRow(2, 1, 1)] });
    addShow(db, { addedAt: "2026-07-10T00:00:00.000Z", episodes: [{ ...episodeRow(3, 1, 1), air_date: null }], show: showRow(3, "Start here") });
    addShow(db, { episodes: [episodeRow(4, 1, 1), episodeRow(4, 1, 2)], show: showRow(4, "Dropped"), watchedEpisodes: [watchedEpisodeRow(4, 1, 1)] });
    db.userShows[3].status = "dropped";
    db.userShows[0].favourite = true;
    addShow(db, { episodes: [episodeRow(5, 1, 1), episodeRow(5, 1, 2, "2026-07-20")], show: showRow(5, "Upcoming"), watchedEpisodes: [watchedEpisodeRow(5, 1, 1)] });
    addShow(db, { episodes: [episodeRow(6, 0, 1)], show: showRow(6, "Specials only"), watchedEpisodes: [watchedEpisodeRow(6, 0, 1)] });
    db.userShows.push(userShowRow(7), { ...userShowRow(8), user_id: "other-user" });
    db.episodes.push(episodeRow(7, 1, 1));
    db.watchedEpisodes.push({ ...watchedEpisodeRow(3, 1, 1), user_id: "other-user" });
    const fullRecords = [...db.userShows].filter((row) => row.user_id === USER_ID)
      .sort((a, b) => b.added_at.localeCompare(a.added_at)).map((userShow) => {
        const show = db.shows.find((row) => row.tmdb_id === userShow.show_tmdb_id);
        return {
          addedAt: userShow.added_at,
          episodes: db.episodes.filter((row) => row.show_tmdb_id === userShow.show_tmdb_id).map(mapEpisodeRow),
          favourite: userShow.favourite,
          posterPath: show?.poster_path ?? null,
          title: show?.title ?? `Show ${userShow.show_tmdb_id}`,
          tmdbId: userShow.show_tmdb_id,
          tmdbStatus: show?.tmdb_status ?? null,
          trackingStatus: userShow.status,
          watchedEpisodes: db.watchedEpisodes.filter((row) => row.user_id === USER_ID && row.show_tmdb_id === userShow.show_tmdb_id).map(mapWatchedEpisodeRow),
        };
      });
    for (const preferences of [DEFAULT_USER_PREFERENCES, { ...DEFAULT_USER_PREFERENCES, hideCompleted: true, hideDropped: true }]) {
      const expected = createDashboardData(fullRecords, preferences, options);
      expect(await getUserDashboardData(client(db), USER_ID, preferences, options)).toEqual(expected);
      expect(await getUserDashboardSummary(client(db), USER_ID, options)).toEqual(expected.summary);
    }
  });

  it.each(["user_shows", "shows", "episodes", "watched_episodes"] as const)("rejects a failed %s read instead of displaying empty Profile statistics", async (table) => {
    const db = new FakeSupabase();
    addShow(db, { episodes: [episodeRow(1, 1, 1)], show: showRow(1, "Example") });
    db.failedTable = table;
    await expect(getUserDashboardSummary(client(db), USER_ID)).rejects.toBeInstanceOf(DashboardDataError);
    if (table === "episodes") await expect(getUserDashboardSummary(client(db), USER_ID)).rejects.toThrow("Unable to load episodes.");
  });

  it("uses the same library subset for Profile and Dashboard when an API row cap applies", async () => {
    const db = new FakeSupabase();
    db.rowLimit = 1;
    addShow(db, { addedAt: "2026-01-01T00:00:00.000Z", episodes: [episodeRow(1, 1, 1)], show: showRow(1, "Older completed", "Ended"), watchedEpisodes: [watchedEpisodeRow(1, 1, 1)] });
    addShow(db, { addedAt: "2026-02-01T00:00:00.000Z", episodes: [episodeRow(2, 1, 1)], show: showRow(2, "New watchlist") });
    const dashboard = await getUserDashboardData(client(db), USER_ID);
    expect(dashboard.summary).toMatchObject({ totalShows: 1, watchlistCount: 1, completedCount: 0 });
    expect(await getUserDashboardSummary(client(db), USER_ID)).toEqual(dashboard.summary);
  });

  it("keeps Profile summary equal to Dashboard across page boundaries, specials, future episodes and user isolation", async () => {
    const db = new FakeSupabase();
    const longShow = Array.from({ length: 1001 }, (_, index) => episodeRow(1, 1, index + 1));
    addShow(db, { episodes: longShow, show: showRow(1, "Completed", "Ended"), watchedEpisodes: watchedRowsFor(longShow) });
    addShow(db, {
      episodes: [episodeRow(2, 0, 1), episodeRow(2, 1, 1), episodeRow(2, 1, 2, "2026-06-08")],
      show: showRow(2, "Caught up"), watchedEpisodes: [watchedEpisodeRow(2, 1, 1)],
    });
    addShow(db, { episodes: [episodeRow(3, 1, 1)], show: showRow(3, "Dropped") });
    addShow(db, { episodes: [episodeRow(4, 1, 1)], show: showRow(4, "Watchlist") });
    db.userShows[1].favourite = true;
    db.userShows[2].status = "dropped";
    db.userShows.push({ ...userShowRow(5), user_id: "other-user" });
    db.shows.push(showRow(5, "Other user's show"));
    db.episodes.push(episodeRow(5, 1, 1));
    db.watchedEpisodes.push({ ...watchedEpisodeRow(4, 1, 1), user_id: "other-user" });
    const options = { referenceDate: "2026-06-07", timeZone: "America/Sao_Paulo" };
    const dashboard = await getUserDashboardData(client(db), USER_ID, undefined, options);
    db.calls.length = 0;
    const summary = await getUserDashboardSummary(client(db), USER_ID, options);
    expect(summary).toEqual(dashboard.summary);
    expect(summary).toMatchObject({ totalShows: 4, completedCount: 1, caughtUpCount: 1, droppedCount: 1, watchlistCount: 1, favouriteCount: 1 });
    expect(db.calls.filter((call) => call.table === "episodes").every((call) =>
      call.columns === "air_date,episode_number,season_number,show_tmdb_id",
    )).toBe(true);
    expect(db.calls.find((call) => call.table === "shows")?.columns).toBe("tmdb_id,tmdb_status");
    expect(db.calls.filter((call) => ["user_shows", "watched_episodes"].includes(call.table)).every((call) =>
      call.filters.some((filter) => filter.kind === "eq" && filter.column === "user_id" && filter.value === USER_ID),
    )).toBe(true);
  });

  it("returns an empty Profile summary without fetching episodes for an empty library", async () => {
    const db = new FakeSupabase();
    expect(await getUserDashboardSummary(client(db), USER_ID)).toEqual((await getUserDashboardData(client(db), USER_ID)).summary);
    expect(db.calls.every((call) => call.table === "user_shows")).toBe(true);
  });

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
      episodeRow(2, 1, 2, "2026-06-08"),
      episodeRow(2, 1, 3, "2026-06-09"),
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

    const dashboard = await getUserDashboardData(client(db), USER_ID, undefined, {
      referenceDate: "2026-06-07",
    });

    expect(dashboard.upcomingEpisodes).toHaveLength(1);
    expect(dashboard.upcomingEpisodes[0]).toMatchObject({
      airDate: "2026-06-08",
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

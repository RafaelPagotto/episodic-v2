import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { getUserShowDetail } from "../features/shows/data";
import { MULTI_SHOW_EPISODE_PAGE_SIZE } from "../features/tracking";
import type { Database } from "../lib/supabase/types";

type EpisodeRow = Database["public"]["Tables"]["episodes"]["Row"];
type SeasonRow = Database["public"]["Tables"]["seasons"]["Row"];
type ShowRow = Database["public"]["Tables"]["shows"]["Row"];
type UserShowRow = Database["public"]["Tables"]["user_shows"]["Row"];
type WatchedEpisodeRow = Database["public"]["Tables"]["watched_episodes"]["Row"];
type TableName = "episodes" | "seasons" | "shows" | "user_shows" | "watched_episodes";
type AnyRow = EpisodeRow | SeasonRow | ShowRow | UserShowRow | WatchedEpisodeRow;
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

const SHOW_TMDB_ID = 100;
const USER_ID = "user-1";

class FakeSupabase {
  episodes: EpisodeRow[] = [];
  seasons: SeasonRow[] = [];
  shows: ShowRow[] = [];
  userShows: UserShowRow[] = [];
  watchedEpisodes: WatchedEpisodeRow[] = [];

  from(table: TableName) {
    return new FakeQuery(this, table);
  }

  getRows(table: TableName): AnyRow[] {
    if (table === "episodes") return this.episodes;
    if (table === "seasons") return this.seasons;
    if (table === "shows") return this.shows;
    if (table === "user_shows") return this.userShows;

    return this.watchedEpisodes;
  }
}

class FakeQuery {
  private readonly filters: QueryFilter[] = [];
  private limitCount: number | null = null;
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

  limit(count: number) {
    this.limitCount = count;
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

    if (this.limitCount !== null) {
      rows = rows.slice(0, this.limitCount);
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

function showRow(title: string, tmdbStatus: string | null = "Returning Series"): ShowRow {
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
    tmdb_id: SHOW_TMDB_ID,
    tmdb_status: tmdbStatus,
    updated_at: "2026-01-03T00:00:00.000Z",
    vote_average: null,
    vote_count: null,
  };
}

function userShowRow(): UserShowRow {
  return {
    added_at: "2026-02-01T00:00:00.000Z",
    created_at: "2026-02-01T00:00:00.000Z",
    favourite: false,
    id: SHOW_TMDB_ID,
    show_tmdb_id: SHOW_TMDB_ID,
    status: "watchlist",
    status_updated_at: "2026-02-01T00:00:00.000Z",
    updated_at: "2026-02-01T00:00:00.000Z",
    user_id: USER_ID,
  };
}

function seasonRow(seasonNumber: number, episodeCount: number): SeasonRow {
  return {
    air_date: "2026-01-01",
    created_at: "2026-01-01T00:00:00.000Z",
    episode_count: episodeCount,
    id: seasonNumber + 1,
    last_synced_at: "2026-01-02T00:00:00.000Z",
    metadata: {},
    name: seasonNumber === 0 ? "Specials" : `Season ${seasonNumber}`,
    overview: null,
    poster_path: null,
    season_number: seasonNumber,
    show_tmdb_id: SHOW_TMDB_ID,
    tmdb_id: SHOW_TMDB_ID * 100 + seasonNumber,
    updated_at: "2026-01-03T00:00:00.000Z",
  };
}

function episodeRow(seasonNumber: number, episodeNumber: number): EpisodeRow {
  return {
    air_date: "2026-01-01",
    created_at: "2026-01-01T00:00:00.000Z",
    episode_key: `${SHOW_TMDB_ID}:${seasonNumber}:${episodeNumber}`,
    episode_number: episodeNumber,
    id: seasonNumber * 100000 + episodeNumber,
    last_synced_at: "2026-01-02T00:00:00.000Z",
    metadata: {},
    overview: null,
    runtime_minutes: 42,
    season_number: seasonNumber,
    show_tmdb_id: SHOW_TMDB_ID,
    still_path: null,
    title: `S${seasonNumber}E${episodeNumber}`,
    tmdb_id: SHOW_TMDB_ID * 1000000 + seasonNumber * 1000 + episodeNumber,
    updated_at: "2026-01-03T00:00:00.000Z",
  };
}

function watchedEpisodeRow(seasonNumber: number, episodeNumber: number): WatchedEpisodeRow {
  return {
    created_at: "2026-01-01T00:00:00.000Z",
    episode_key: `${SHOW_TMDB_ID}:${seasonNumber}:${episodeNumber}`,
    episode_number: episodeNumber,
    id: seasonNumber * 100000 + episodeNumber,
    season_number: seasonNumber,
    show_tmdb_id: SHOW_TMDB_ID,
    user_id: USER_ID,
    watched_at: "2026-01-04T00:00:00.000Z",
  };
}

function seedShow(
  db: FakeSupabase,
  {
    episodes,
    seasons,
    show = showRow("Test Show"),
    watchedEpisodes = [],
  }: {
    episodes: EpisodeRow[];
    seasons: SeasonRow[];
    show?: ShowRow;
    watchedEpisodes?: WatchedEpisodeRow[];
  },
) {
  db.shows = [show];
  db.userShows = [userShowRow()];
  db.seasons = seasons;
  db.episodes = episodes;
  db.watchedEpisodes = watchedEpisodes;
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

describe("show detail data loading", () => {
  it("uses paginated full-show episode loading for Show Detail progress and seasons", async () => {
    const db = new FakeSupabase();
    const episodes = Array.from({ length: MULTI_SHOW_EPISODE_PAGE_SIZE + 1 }, (_, index) =>
      episodeRow(1, index + 1),
    );

    seedShow(db, {
      episodes,
      seasons: [seasonRow(1, episodes.length)],
      watchedEpisodes: episodes.map((episode) => watchedEpisodeRow(episode.season_number, episode.episode_number)),
    });

    const show = await getUserShowDetail(client(db), USER_ID, SHOW_TMDB_ID);

    expect(show?.progress).toMatchObject({
      displayStatus: "caught_up",
      progressPercentage: 100,
      totalEpisodeCount: MULTI_SHOW_EPISODE_PAGE_SIZE + 1,
      watchedEpisodeCount: MULTI_SHOW_EPISODE_PAGE_SIZE + 1,
    });
    expect(show?.seasons[0]?.episodes).toHaveLength(MULTI_SHOW_EPISODE_PAGE_SIZE + 1);
  });

  it("excludes Specials from Show Detail main progress while keeping them visible", async () => {
    const db = new FakeSupabase();

    seedShow(db, {
      episodes: [episodeRow(0, 1), episodeRow(1, 1), episodeRow(1, 2)],
      seasons: [seasonRow(0, 1), seasonRow(1, 2)],
      show: showRow("Specials Show", "Ended"),
      watchedEpisodes: [watchedEpisodeRow(1, 1), watchedEpisodeRow(1, 2)],
    });

    const show = await getUserShowDetail(client(db), USER_ID, SHOW_TMDB_ID);

    expect(show?.progress).toMatchObject({
      displayStatus: "completed",
      progressPercentage: 100,
      totalEpisodeCount: 2,
      watchedEpisodeCount: 2,
    });
    expect(show?.seasons.map((season) => season.seasonNumber)).toEqual([0, 1]);
    expect(show?.seasons[0]?.episodes).toHaveLength(1);
  });

  it("counts miniseries season 1 as main-series progress", async () => {
    const db = new FakeSupabase();
    const episodes = Array.from({ length: 8 }, (_, index) => episodeRow(1, index + 1));

    seedShow(db, {
      episodes,
      seasons: [seasonRow(1, 8)],
      show: showRow("The Fall of the House of Usher", "Ended"),
      watchedEpisodes: episodes.map((episode) => watchedEpisodeRow(episode.season_number, episode.episode_number)),
    });

    const show = await getUserShowDetail(client(db), USER_ID, SHOW_TMDB_ID);

    expect(show?.progress).toMatchObject({
      displayStatus: "completed",
      progressPercentage: 100,
      totalEpisodeCount: 8,
      watchedEpisodeCount: 8,
    });
  });
});

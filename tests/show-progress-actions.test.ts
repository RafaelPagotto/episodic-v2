import { describe, expect, it } from "vitest";

import { markContinueWatchingNextEpisodeWatched } from "../features/dashboard/data";
import {
  markShowWatched,
  setEpisodeWatched,
  setSeasonWatched,
} from "../features/shows/data";
import { MULTI_SHOW_EPISODE_PAGE_SIZE, type TrackingStatus } from "../features/tracking";

type SupabaseTestClient = Parameters<typeof markShowWatched>[0];

type UserShowRow = {
  added_at: string;
  favourite: boolean;
  id: number;
  show_tmdb_id: number;
  status: TrackingStatus;
  status_updated_at: string;
  user_id: string;
};

type EpisodeRow = {
  air_date: string | null;
  episode_number: number;
  id: number;
  overview: string | null;
  runtime_minutes: number | null;
  season_number: number;
  show_tmdb_id: number;
  still_path: string | null;
  title: string;
  tmdb_id: number;
};

type ShowRow = {
  backdrop_path: string | null;
  first_air_date: string | null;
  id: number;
  poster_path: string | null;
  title: string;
  tmdb_id: number;
  tmdb_status: string | null;
};

type WatchedEpisodeInsert = {
  episode_number: number;
  season_number: number;
  show_tmdb_id: number;
  user_id: string;
};

type WatchedEpisodeRow = WatchedEpisodeInsert & {
  id: number;
  watched_at: string;
};

type TableName = "episodes" | "shows" | "user_shows" | "watched_episodes";

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

type QueryResponse = {
  data: unknown[] | null;
  error: null;
};

const SHOW_TMDB_ID = 100;
const USER_ID = "user-1";

class FakeSupabase {
  episodes: EpisodeRow[];
  shows: ShowRow[];
  userShows: UserShowRow[];
  watchedEpisodes: WatchedEpisodeRow[] = [];

  private watchedEpisodeId = 1;

  constructor() {
    this.userShows = [
      {
        added_at: "2026-01-01T00:00:00.000Z",
        favourite: false,
        id: 1,
        show_tmdb_id: SHOW_TMDB_ID,
        status: "watchlist",
        status_updated_at: "2026-01-01T00:00:00.000Z",
        user_id: USER_ID,
      },
    ];
    this.shows = [
      {
        backdrop_path: null,
        first_air_date: "2026-01-01",
        id: 1,
        poster_path: null,
        title: "Test Show",
        tmdb_id: SHOW_TMDB_ID,
        tmdb_status: "Returning Series",
      },
    ];
    this.episodes = [
      episodeRow(0, 1),
      episodeRow(1, 1),
      episodeRow(1, 2),
    ];
  }

  from(table: TableName) {
    return new FakeQuery(this, table);
  }

  getRows(table: TableName) {
    if (table === "episodes") return this.episodes;
    if (table === "shows") return this.shows;
    if (table === "user_shows") return this.userShows;

    return this.watchedEpisodes;
  }

  upsertWatchedEpisodes(values: WatchedEpisodeInsert[]) {
    values.forEach((value) => {
      const existingRow = this.watchedEpisodes.find(
        (row) =>
          row.user_id === value.user_id
          && row.show_tmdb_id === value.show_tmdb_id
          && row.season_number === value.season_number
          && row.episode_number === value.episode_number,
      );

      if (existingRow) {
        return;
      }

      this.watchedEpisodes.push({
        ...value,
        id: this.watchedEpisodeId++,
        watched_at: "2026-01-01T00:00:00.000Z",
      });
    });
  }

  deleteRows(table: TableName, filters: QueryFilter[]) {
    if (table !== "watched_episodes") {
      return;
    }

    this.watchedEpisodes = this.watchedEpisodes.filter((row) => !matchesFilters(row, filters));
  }

  updateRows(table: TableName, filters: QueryFilter[], values: Record<string, unknown>) {
    if (table !== "user_shows") {
      return;
    }

    this.userShows = this.userShows.map((row) =>
      matchesFilters(row, filters)
        ? {
          ...row,
          ...values,
        }
        : row,
    );
  }
}

class FakeQuery {
  private filters: QueryFilter[] = [];
  private limitCount: number | null = null;
  private orderColumns: string[] = [];
  private operation: "delete" | "select" | "update" = "select";
  private updateValues: Record<string, unknown> = {};

  constructor(
    private readonly db: FakeSupabase,
    private readonly table: TableName,
  ) {}

  delete() {
    this.operation = "delete";
    return this;
  }

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

  order(column: string) {
    this.orderColumns.push(column);
    return this;
  }

  select() {
    this.operation = "select";
    return this;
  }

  range(rangeStart: number, rangeEnd: number) {
    return Promise.resolve(this.execute(rangeStart, rangeEnd));
  }

  update(values: Record<string, unknown>) {
    this.operation = "update";
    this.updateValues = values;
    return this;
  }

  upsert(values: WatchedEpisodeInsert | WatchedEpisodeInsert[]) {
    this.db.upsertWatchedEpisodes(Array.isArray(values) ? values : [values]);

    return Promise.resolve({ data: null, error: null });
  }

  then<TResult1 = QueryResponse, TResult2 = never>(
    onfulfilled?: ((value: QueryResponse) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
  }

  private execute(rangeStart?: number, rangeEnd?: number): QueryResponse {
    if (this.operation === "delete") {
      this.db.deleteRows(this.table, this.filters);
      return { data: null, error: null };
    }

    if (this.operation === "update") {
      this.db.updateRows(this.table, this.filters, this.updateValues);
      return { data: null, error: null };
    }

    let rows = this.db.getRows(this.table).filter((row) => matchesFilters(row, this.filters));

    if (this.orderColumns.length > 0) {
      rows = [...rows].sort((left, right) => {
        for (const column of this.orderColumns) {
          const leftValue = getColumnValue(left, column);
          const rightValue = getColumnValue(right, column);

          if (typeof leftValue === "number" && typeof rightValue === "number" && leftValue !== rightValue) {
            return leftValue - rightValue;
          }
        }

        return 0;
      });
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

function episodeRow(seasonNumber: number, episodeNumber: number, airDate = "2026-01-01"): EpisodeRow {
  return {
    air_date: airDate,
    episode_number: episodeNumber,
    id: seasonNumber * 10 + episodeNumber,
    overview: null,
    runtime_minutes: 42,
    season_number: seasonNumber,
    show_tmdb_id: SHOW_TMDB_ID,
    still_path: null,
    title: `S${seasonNumber}E${episodeNumber}`,
    tmdb_id: SHOW_TMDB_ID * 1000 + seasonNumber * 10 + episodeNumber,
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

function watchedEpisodeKeys(db: FakeSupabase) {
  return db.watchedEpisodes
    .map((episode) => `${episode.season_number}:${episode.episode_number}`)
    .sort();
}

function client(db: FakeSupabase): SupabaseTestClient {
  return db as unknown as SupabaseTestClient;
}

describe("show progress actions", () => {
  it("marks only released main-series episodes when marking the whole show watched", async () => {
    const db = new FakeSupabase();

    await markShowWatched(client(db), USER_ID, SHOW_TMDB_ID);

    expect(watchedEpisodeKeys(db)).toEqual(["1:1", "1:2"]);
    expect(db.userShows[0]?.status).toBe("watched");
  });

  it("excludes future episodes from Mark Show Watched until local midnight", async () => {
    const beforeDb = new FakeSupabase();
    beforeDb.episodes = [episodeRow(1, 1, "2026-07-18"), episodeRow(1, 2, "2026-07-19")];
    const beforeRelease = {
      referenceDate: new Date("2026-07-19T02:30:00.000Z"),
      timeZone: "America/Sao_Paulo",
    };

    await markShowWatched(client(beforeDb), USER_ID, SHOW_TMDB_ID, beforeRelease);
    expect(watchedEpisodeKeys(beforeDb)).toEqual(["1:1"]);

    const releaseDb = new FakeSupabase();
    releaseDb.episodes = [episodeRow(1, 1, "2026-07-18"), episodeRow(1, 2, "2026-07-19")];

    await markShowWatched(client(releaseDb), USER_ID, SHOW_TMDB_ID, {
      referenceDate: new Date("2026-07-19T03:00:00.000Z"),
      timeZone: "America/Sao_Paulo",
    });
    expect(watchedEpisodeKeys(releaseDb)).toEqual(["1:1", "1:2"]);
  });

  it("excludes future episodes from Mark Season Watched until local midnight", async () => {
    const beforeDb = new FakeSupabase();
    beforeDb.episodes = [episodeRow(1, 1, "2026-07-18"), episodeRow(1, 2, "2026-07-19")];

    await setSeasonWatched(client(beforeDb), USER_ID, SHOW_TMDB_ID, 1, true, {
      referenceDate: new Date("2026-07-19T02:30:00.000Z"),
      timeZone: "America/Sao_Paulo",
    });
    expect(watchedEpisodeKeys(beforeDb)).toEqual(["1:1"]);

    const releaseDb = new FakeSupabase();
    releaseDb.episodes = [episodeRow(1, 1, "2026-07-18"), episodeRow(1, 2, "2026-07-19")];

    await setSeasonWatched(client(releaseDb), USER_ID, SHOW_TMDB_ID, 1, true, {
      referenceDate: new Date("2026-07-19T03:00:00.000Z"),
      timeZone: "America/Sao_Paulo",
    });
    expect(watchedEpisodeKeys(releaseDb)).toEqual(["1:1", "1:2"]);
  });

  it("marks show watched across paginated full-show episodes while excluding specials", async () => {
    const db = new FakeSupabase();
    db.episodes = [
      episodeRow(0, 1),
      ...Array.from({ length: MULTI_SHOW_EPISODE_PAGE_SIZE + 1 }, (_, index) => episodeRow(1, index + 1)),
    ];

    await markShowWatched(client(db), USER_ID, SHOW_TMDB_ID);

    expect(db.watchedEpisodes).toHaveLength(MULTI_SHOW_EPISODE_PAGE_SIZE + 1);
    expect(db.watchedEpisodes).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          season_number: 0,
        }),
      ]),
    );
    expect(db.watchedEpisodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          episode_number: MULTI_SHOW_EPISODE_PAGE_SIZE + 1,
          season_number: 1,
        }),
      ]),
    );
    expect(db.userShows[0]?.status).toBe("watched");
  });

  it("updates status from progress using complete paginated full-show episode data", async () => {
    const db = new FakeSupabase();
    db.episodes = Array.from({ length: MULTI_SHOW_EPISODE_PAGE_SIZE + 1 }, (_, index) =>
      episodeRow(1, index + 1),
    );
    db.upsertWatchedEpisodes(
      db.episodes
        .slice(0, MULTI_SHOW_EPISODE_PAGE_SIZE)
        .map((episode) => ({
          episode_number: episode.episode_number,
          season_number: episode.season_number,
          show_tmdb_id: episode.show_tmdb_id,
          user_id: USER_ID,
        })),
    );

    await setEpisodeWatched(client(db), USER_ID, SHOW_TMDB_ID, 1, MULTI_SHOW_EPISODE_PAGE_SIZE + 1, true);

    expect(db.watchedEpisodes).toHaveLength(MULTI_SHOW_EPISODE_PAGE_SIZE + 1);
    expect(db.userShows[0]?.status).toBe("watched");
  });

  it("marks season 0 specials when explicitly marking the Specials season watched", async () => {
    const db = new FakeSupabase();

    await setSeasonWatched(client(db), USER_ID, SHOW_TMDB_ID, 0, true);

    expect(watchedEpisodeKeys(db)).toEqual(["0:1"]);
    expect(db.userShows[0]?.status).toBe("watchlist");
  });

  it("allows individual special episodes to be watched and unwatched", async () => {
    const db = new FakeSupabase();

    await setEpisodeWatched(client(db), USER_ID, SHOW_TMDB_ID, 0, 1, true);
    expect(watchedEpisodeKeys(db)).toEqual(["0:1"]);
    expect(db.userShows[0]?.status).toBe("watchlist");

    await setEpisodeWatched(client(db), USER_ID, SHOW_TMDB_ID, 0, 1, false);
    expect(watchedEpisodeKeys(db)).toEqual([]);
    expect(db.userShows[0]?.status).toBe("watchlist");
  });

  it("does not mark an individual episode watched before local release", async () => {
    const db = new FakeSupabase();
    db.episodes = [episodeRow(1, 1, "2026-07-19")];

    await expect(
      setEpisodeWatched(client(db), USER_ID, SHOW_TMDB_ID, 1, 1, true, {
        referenceDate: new Date("2026-07-19T02:30:00.000Z"),
        timeZone: "America/Sao_Paulo",
      }),
    ).rejects.toThrow("This episode has not been released yet.");
    expect(watchedEpisodeKeys(db)).toEqual([]);

    await setEpisodeWatched(client(db), USER_ID, SHOW_TMDB_ID, 1, 1, true, {
      referenceDate: new Date("2026-07-19T03:00:00.000Z"),
      timeZone: "America/Sao_Paulo",
    });
    expect(watchedEpisodeKeys(db)).toEqual(["1:1"]);
  });

  it("marks exactly the displayed Continue Watching next episode", async () => {
    const db = new FakeSupabase();
    db.episodes.push(episodeRow(1, 3));
    db.upsertWatchedEpisodes([
      {
        episode_number: 1,
        season_number: 1,
        show_tmdb_id: SHOW_TMDB_ID,
        user_id: USER_ID,
      },
    ]);

    await markContinueWatchingNextEpisodeWatched(client(db), USER_ID, SHOW_TMDB_ID, 1, 2);

    expect(watchedEpisodeKeys(db)).toEqual(["1:1", "1:2"]);
    expect(db.userShows[0]?.status).toBe("watching");
  });

  it("does not let the Continue Watching action mark specials or dropped shows", async () => {
    const db = new FakeSupabase();
    db.upsertWatchedEpisodes([
      {
        episode_number: 1,
        season_number: 1,
        show_tmdb_id: SHOW_TMDB_ID,
        user_id: USER_ID,
      },
    ]);

    await expect(markContinueWatchingNextEpisodeWatched(client(db), USER_ID, SHOW_TMDB_ID, 0, 1)).rejects.toThrow(
      "The next episode has changed.",
    );
    expect(watchedEpisodeKeys(db)).toEqual(["1:1"]);

    db.userShows[0] = {
      ...db.userShows[0],
      status: "dropped",
    };

    await expect(markContinueWatchingNextEpisodeWatched(client(db), USER_ID, SHOW_TMDB_ID, 1, 2)).rejects.toThrow(
      "No main-series episode is currently available",
    );
    expect(watchedEpisodeKeys(db)).toEqual(["1:1"]);
  });

  it("does not let Continue Watching expose an episode before local release", async () => {
    const db = new FakeSupabase();
    db.episodes = [episodeRow(1, 1, "2026-07-18"), episodeRow(1, 2, "2026-07-19")];
    db.upsertWatchedEpisodes([
      {
        episode_number: 1,
        season_number: 1,
        show_tmdb_id: SHOW_TMDB_ID,
        user_id: USER_ID,
      },
    ]);

    await expect(
      markContinueWatchingNextEpisodeWatched(client(db), USER_ID, SHOW_TMDB_ID, 1, 2, {
        referenceDate: new Date("2026-07-19T02:30:00.000Z"),
        timeZone: "America/Sao_Paulo",
      }),
    ).rejects.toThrow("No main-series episode is currently available to continue.");
    expect(watchedEpisodeKeys(db)).toEqual(["1:1"]);

    await markContinueWatchingNextEpisodeWatched(client(db), USER_ID, SHOW_TMDB_ID, 1, 2, {
      referenceDate: new Date("2026-07-19T03:00:00.000Z"),
      timeZone: "America/Sao_Paulo",
    });
    expect(watchedEpisodeKeys(db)).toEqual(["1:1", "1:2"]);
  });
});

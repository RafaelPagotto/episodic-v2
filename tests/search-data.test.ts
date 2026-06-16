import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { addTmdbShowToLibrary, upsertTmdbShowMetadata } from "../features/search/data";
import type { Database } from "../lib/supabase/types";
import type {
  NormalizedTmdbEpisode,
  NormalizedTmdbFullShow,
  NormalizedTmdbSeason,
} from "../lib/tmdb/types";

type EpisodeInsert = Database["public"]["Tables"]["episodes"]["Insert"];
type EpisodeRow = Database["public"]["Tables"]["episodes"]["Row"];
type SeasonInsert = Database["public"]["Tables"]["seasons"]["Insert"];
type SeasonRow = Database["public"]["Tables"]["seasons"]["Row"];
type ShowInsert = Database["public"]["Tables"]["shows"]["Insert"];
type ShowRow = Database["public"]["Tables"]["shows"]["Row"];
type UserShowInsert = Database["public"]["Tables"]["user_shows"]["Insert"];
type UserShowRow = Database["public"]["Tables"]["user_shows"]["Row"];
type WatchedEpisodeRow = Database["public"]["Tables"]["watched_episodes"]["Row"];

type TableName = "episodes" | "seasons" | "shows" | "user_shows" | "watched_episodes";
type AnyRow = EpisodeRow | SeasonRow | ShowRow | UserShowRow | WatchedEpisodeRow;
type QueryFilter = {
  column: string;
  value: unknown;
};
type QueryResponse = {
  data: AnyRow[] | null;
  error: { code?: string; message?: string } | null;
};
type RecordedCall = {
  method: "insert" | "select" | "upsert";
  onConflict?: string;
  table: TableName;
};

const NOW = "2026-01-01T00:00:00.000Z";
const OLD_SYNCED_AT = "2026-01-02T00:00:00.000Z";
const SYNCED_AT = "2026-06-01T12:00:00.000Z";
const SHOW_TMDB_ID = 1396;
const USER_ID = "user-1";

class FakeSupabase {
  calls: RecordedCall[] = [];
  episodes: EpisodeRow[] = [];
  seasons: SeasonRow[] = [];
  shows: ShowRow[] = [];
  userShows: UserShowRow[] = [];
  watchedEpisodes: WatchedEpisodeRow[] = [];

  private nextSeasonId = 1;
  private nextUserShowId = 1;

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

  insertUserShow(value: UserShowInsert): QueryResponse {
    if (
      this.userShows.some(
        (row) => row.user_id === value.user_id && row.show_tmdb_id === value.show_tmdb_id,
      )
    ) {
      return {
        data: null,
        error: { code: "23505", message: "duplicate key value violates unique constraint" },
      };
    }

    this.userShows.push(userShowRow(value, this.nextUserShowId++));

    return { data: null, error: null };
  }

  upsertRows(table: TableName, values: unknown, onConflict: string): QueryResponse {
    const rows = Array.isArray(values) ? values : [values];

    if (table === "shows") {
      upsertRows(this.shows, rows as ShowInsert[], onConflict, showRowFromInsert);
      return { data: null, error: null };
    }

    if (table === "seasons") {
      upsertRows(this.seasons, rows as SeasonInsert[], onConflict, (value, existing) =>
        seasonRowFromInsert(value, existing, this.nextSeasonId++),
      );
      return { data: null, error: null };
    }

    if (table === "episodes") {
      upsertRows(this.episodes, rows as EpisodeInsert[], onConflict, episodeRowFromInsert);
      return { data: null, error: null };
    }

    throw new Error(`Unexpected upsert table: ${table}`);
  }
}

class FakeQuery {
  private readonly filters: QueryFilter[] = [];

  constructor(
    private readonly db: FakeSupabase,
    private readonly table: TableName,
  ) {}

  eq(column: string, value: unknown) {
    this.filters.push({ column, value });
    return this;
  }

  insert(value: UserShowInsert) {
    this.db.calls.push({ method: "insert", table: this.table });

    if (this.table !== "user_shows") {
      throw new Error(`Unexpected insert table: ${this.table}`);
    }

    return Promise.resolve(this.db.insertUserShow(value));
  }

  select() {
    this.db.calls.push({ method: "select", table: this.table });
    return this;
  }

  upsert(values: unknown, options: { onConflict?: string } = {}) {
    const onConflict = options.onConflict ?? "";
    this.db.calls.push({ method: "upsert", onConflict, table: this.table });

    return Promise.resolve(this.db.upsertRows(this.table, values, onConflict));
  }

  then<TResult1 = QueryResponse, TResult2 = never>(
    onfulfilled?: ((value: QueryResponse) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
  }

  private execute(): QueryResponse {
    return {
      data: this.db.getRows(this.table).filter((row) => matchesFilters(row, this.filters)),
      error: null,
    };
  }
}

function client(db: FakeSupabase): SupabaseClient<Database> {
  return db as unknown as SupabaseClient<Database>;
}

function buildTmdbShow({
  episodes = [tmdbEpisode(1, 1), tmdbEpisode(2, 1)],
  seasons = [tmdbSeason(1, 1), tmdbSeason(2, 1)],
  title = "Breaking Bad",
}: {
  episodes?: NormalizedTmdbEpisode[];
  seasons?: NormalizedTmdbSeason[];
  title?: string;
} = {}): NormalizedTmdbFullShow {
  return {
    attribution: {
      notice: "This product uses the TMDB API but is not endorsed or certified by TMDB.",
      sourceName: "TMDB",
      sourceUrl: "https://www.themoviedb.org",
    },
    episodes,
    seasons,
    show: {
      backdropPath: "/backdrop.jpg",
      episodeRunTime: [45],
      firstAirDate: "2008-01-20",
      genres: [{ id: 18, name: "Drama" }],
      homepage: "https://example.com",
      inProduction: false,
      languages: ["en"],
      lastAirDate: "2013-09-29",
      networks: [{ id: 174, logoPath: "/amc.png", name: "AMC", originCountry: "US" }],
      numberOfEpisodes: episodes.length,
      numberOfSeasons: seasons.length,
      originCountries: ["US"],
      originalLanguage: "en",
      originalTitle: title,
      overview: "A chemistry teacher starts cooking.",
      popularity: 120,
      posterPath: "/poster.jpg",
      status: "Ended",
      tagline: "Change the equation.",
      title,
      tmdbId: SHOW_TMDB_ID,
      type: "Scripted",
      voteAverage: 8.9,
      voteCount: 13000,
    },
  };
}

function tmdbSeason(seasonNumber: number, episodeCount: number, name = `Season ${seasonNumber}`): NormalizedTmdbSeason {
  return {
    airDate: "2008-01-20",
    episodeCount,
    episodes: [],
    name,
    overview: `${name} overview.`,
    posterPath: `/season-${seasonNumber}.jpg`,
    seasonNumber,
    showTmdbId: SHOW_TMDB_ID,
    tmdbId: SHOW_TMDB_ID * 100 + seasonNumber,
    voteAverage: 8,
  };
}

function tmdbEpisode(seasonNumber: number, episodeNumber: number, title = `S${seasonNumber}E${episodeNumber}`): NormalizedTmdbEpisode {
  return {
    airDate: "2008-01-20",
    episodeNumber,
    episodeType: "standard",
    overview: `${title} overview.`,
    runtimeMinutes: 58,
    seasonNumber,
    showTmdbId: SHOW_TMDB_ID,
    stillPath: `/still-${seasonNumber}-${episodeNumber}.jpg`,
    title,
    tmdbId: SHOW_TMDB_ID * 1000000 + seasonNumber * 1000 + episodeNumber,
    voteAverage: 8.2,
    voteCount: 120,
  };
}

function showRow({
  lastSyncedAt = OLD_SYNCED_AT,
  title = "Old Title",
}: {
  lastSyncedAt?: string;
  title?: string;
} = {}): ShowRow {
  return showRowFromInsert({
    backdrop_path: null,
    first_air_date: "2008-01-20",
    genres: [],
    last_air_date: null,
    last_synced_at: lastSyncedAt,
    metadata: {},
    original_language: "en",
    original_title: title,
    overview: null,
    popularity: null,
    poster_path: null,
    title,
    tmdb_id: SHOW_TMDB_ID,
    tmdb_status: "Returning Series",
    vote_average: null,
    vote_count: null,
  });
}

function seasonRow(seasonNumber: number, name = `Old Season ${seasonNumber}`): SeasonRow {
  return seasonRowFromInsert({
    air_date: "2008-01-20",
    episode_count: 1,
    last_synced_at: OLD_SYNCED_AT,
    metadata: {},
    name,
    overview: null,
    poster_path: null,
    season_number: seasonNumber,
    show_tmdb_id: SHOW_TMDB_ID,
    tmdb_id: SHOW_TMDB_ID * 100 + seasonNumber,
  }, undefined, seasonNumber + 1);
}

function episodeRow(seasonNumber: number, episodeNumber: number, title = `Old S${seasonNumber}E${episodeNumber}`): EpisodeRow {
  return episodeRowFromInsert({
    air_date: "2008-01-20",
    episode_number: episodeNumber,
    last_synced_at: OLD_SYNCED_AT,
    metadata: {},
    overview: null,
    runtime_minutes: 42,
    season_number: seasonNumber,
    show_tmdb_id: SHOW_TMDB_ID,
    still_path: null,
    title,
    tmdb_id: SHOW_TMDB_ID * 1000000 + seasonNumber * 1000 + episodeNumber,
  });
}

function userShowRow(value: UserShowInsert, id = 1): UserShowRow {
  return {
    added_at: value.added_at ?? NOW,
    created_at: value.created_at ?? NOW,
    favourite: value.favourite ?? false,
    id,
    show_tmdb_id: value.show_tmdb_id,
    status: value.status ?? "watchlist",
    status_updated_at: value.status_updated_at ?? NOW,
    updated_at: value.updated_at ?? NOW,
    user_id: value.user_id,
  };
}

function watchedEpisodeRow(seasonNumber: number, episodeNumber: number): WatchedEpisodeRow {
  return {
    created_at: NOW,
    episode_key: `${SHOW_TMDB_ID}:${seasonNumber}:${episodeNumber}`,
    episode_number: episodeNumber,
    id: seasonNumber * 1000 + episodeNumber,
    season_number: seasonNumber,
    show_tmdb_id: SHOW_TMDB_ID,
    user_id: USER_ID,
    watched_at: "2026-02-01T00:00:00.000Z",
  };
}

function showRowFromInsert(value: ShowInsert, existing?: ShowRow): ShowRow {
  return {
    backdrop_path: value.backdrop_path ?? existing?.backdrop_path ?? null,
    created_at: existing?.created_at ?? value.created_at ?? NOW,
    first_air_date: value.first_air_date ?? existing?.first_air_date ?? null,
    genres: value.genres ?? existing?.genres ?? [],
    last_air_date: value.last_air_date ?? existing?.last_air_date ?? null,
    last_synced_at: value.last_synced_at ?? existing?.last_synced_at ?? null,
    metadata: value.metadata ?? existing?.metadata ?? {},
    original_language: value.original_language ?? existing?.original_language ?? null,
    original_title: value.original_title ?? existing?.original_title ?? null,
    overview: value.overview ?? existing?.overview ?? null,
    popularity: value.popularity ?? existing?.popularity ?? null,
    poster_path: value.poster_path ?? existing?.poster_path ?? null,
    title: value.title,
    tmdb_id: value.tmdb_id,
    tmdb_status: value.tmdb_status ?? existing?.tmdb_status ?? null,
    updated_at: value.updated_at ?? NOW,
    vote_average: value.vote_average ?? existing?.vote_average ?? null,
    vote_count: value.vote_count ?? existing?.vote_count ?? null,
  };
}

function seasonRowFromInsert(value: SeasonInsert, existing?: SeasonRow, id = 1): SeasonRow {
  return {
    air_date: value.air_date ?? existing?.air_date ?? null,
    created_at: existing?.created_at ?? value.created_at ?? NOW,
    episode_count: value.episode_count ?? existing?.episode_count ?? 0,
    id: existing?.id ?? id,
    last_synced_at: value.last_synced_at ?? existing?.last_synced_at ?? null,
    metadata: value.metadata ?? existing?.metadata ?? {},
    name: value.name,
    overview: value.overview ?? existing?.overview ?? null,
    poster_path: value.poster_path ?? existing?.poster_path ?? null,
    season_number: value.season_number,
    show_tmdb_id: value.show_tmdb_id,
    tmdb_id: value.tmdb_id ?? existing?.tmdb_id ?? null,
    updated_at: value.updated_at ?? NOW,
  };
}

function episodeRowFromInsert(value: EpisodeInsert, existing?: EpisodeRow): EpisodeRow {
  return {
    air_date: value.air_date ?? existing?.air_date ?? null,
    created_at: existing?.created_at ?? value.created_at ?? NOW,
    episode_key: `${value.show_tmdb_id}:${value.season_number}:${value.episode_number}`,
    episode_number: value.episode_number,
    id: existing?.id ?? value.show_tmdb_id * 1000000 + value.season_number * 1000 + value.episode_number,
    last_synced_at: value.last_synced_at ?? existing?.last_synced_at ?? null,
    metadata: value.metadata ?? existing?.metadata ?? {},
    overview: value.overview ?? existing?.overview ?? null,
    runtime_minutes: value.runtime_minutes ?? existing?.runtime_minutes ?? null,
    season_number: value.season_number,
    show_tmdb_id: value.show_tmdb_id,
    still_path: value.still_path ?? existing?.still_path ?? null,
    title: value.title,
    tmdb_id: value.tmdb_id ?? existing?.tmdb_id ?? null,
    updated_at: value.updated_at ?? NOW,
  };
}

function upsertRows<Row extends object, Insert extends object>(
  rows: Row[],
  values: Insert[],
  onConflict: string,
  toRow: (value: Insert, existing?: Row) => Row,
) {
  values.forEach((value) => {
    const existingIndex = findConflictIndex(rows, value, onConflict);

    if (existingIndex >= 0) {
      rows[existingIndex] = toRow(value, rows[existingIndex]);
      return;
    }

    rows.push(toRow(value));
  });
}

function findConflictIndex(rows: object[], value: object, onConflict: string) {
  const columns = onConflict.split(",").map((column) => column.trim());

  return rows.findIndex((row) =>
    columns.every((column) => getColumnValue(row, column) === getColumnValue(value, column)),
  );
}

function getColumnValue(row: object, column: string) {
  return (row as Record<string, unknown>)[column];
}

function matchesFilters(row: object, filters: QueryFilter[]) {
  return filters.every((filter) => getColumnValue(row, filter.column) === filter.value);
}

describe("search data", () => {
  it("upserts show, season, and episode metadata with one sync timestamp", async () => {
    const db = new FakeSupabase();

    const result = await upsertTmdbShowMetadata({
      lastSyncedAt: SYNCED_AT,
      metadataClient: client(db),
      tmdbShow: buildTmdbShow(),
    });

    expect(result).toMatchObject({
      episodeCount: 2,
      lastSyncedAt: SYNCED_AT,
      seasonCount: 2,
      title: "Breaking Bad",
      tmdbId: SHOW_TMDB_ID,
    });
    expect(db.calls).toEqual([
      { method: "upsert", onConflict: "tmdb_id", table: "shows" },
      { method: "upsert", onConflict: "show_tmdb_id,season_number", table: "seasons" },
      { method: "upsert", onConflict: "show_tmdb_id,season_number,episode_number", table: "episodes" },
    ]);
    expect(db.shows).toEqual([
      expect.objectContaining({
        last_synced_at: SYNCED_AT,
        title: "Breaking Bad",
        tmdb_id: SHOW_TMDB_ID,
      }),
    ]);
    expect(db.seasons.map((season) => `${season.season_number}:${season.last_synced_at}`)).toEqual([
      `1:${SYNCED_AT}`,
      `2:${SYNCED_AT}`,
    ]);
    expect(db.episodes.map((episode) => `${episode.season_number}:${episode.episode_number}:${episode.last_synced_at}`)).toEqual([
      `1:1:${SYNCED_AT}`,
      `2:1:${SYNCED_AT}`,
    ]);
  });

  it("does not insert user_shows or modify watched_episodes from the metadata helper", async () => {
    const db = new FakeSupabase();
    db.userShows = [
      userShowRow({
        favourite: true,
        show_tmdb_id: SHOW_TMDB_ID,
        status: "dropped",
        user_id: USER_ID,
      }),
    ];
    db.watchedEpisodes = [watchedEpisodeRow(1, 1)];
    const userShowsBefore = db.userShows.map((row) => ({ ...row }));
    const watchedEpisodesBefore = db.watchedEpisodes.map((row) => ({ ...row }));

    await upsertTmdbShowMetadata({
      lastSyncedAt: SYNCED_AT,
      metadataClient: client(db),
      tmdbShow: buildTmdbShow(),
    });

    expect(db.userShows).toEqual(userShowsBefore);
    expect(db.watchedEpisodes).toEqual(watchedEpisodesBefore);
    expect(db.calls).not.toEqual(expect.arrayContaining([expect.objectContaining({ table: "user_shows" })]));
    expect(db.calls).not.toEqual(expect.arrayContaining([expect.objectContaining({ table: "watched_episodes" })]));
  });

  it("preserves additive update-only metadata behavior without deleting missing seasons or episodes", async () => {
    const db = new FakeSupabase();
    db.shows = [showRow({ title: "Old Title" })];
    db.seasons = [seasonRow(1), seasonRow(99, "Archived Season")];
    db.episodes = [episodeRow(1, 1), episodeRow(99, 1, "Archived Episode")];

    await upsertTmdbShowMetadata({
      lastSyncedAt: SYNCED_AT,
      metadataClient: client(db),
      tmdbShow: buildTmdbShow({
        episodes: [tmdbEpisode(1, 1, "Updated Pilot"), tmdbEpisode(2, 1, "New Episode")],
        seasons: [tmdbSeason(1, 1, "Updated Season"), tmdbSeason(2, 1, "New Season")],
        title: "Updated Title",
      }),
    });

    expect(db.shows).toEqual([
      expect.objectContaining({
        last_synced_at: SYNCED_AT,
        title: "Updated Title",
      }),
    ]);
    expect(db.seasons.map((season) => `${season.season_number}:${season.name}`)).toEqual([
      "1:Updated Season",
      "99:Archived Season",
      "2:New Season",
    ]);
    expect(db.episodes.map((episode) => `${episode.season_number}:${episode.episode_number}:${episode.title}`)).toEqual([
      "1:1:Updated Pilot",
      "99:1:Archived Episode",
      "2:1:New Episode",
    ]);
  });

  it("keeps add-show behavior by inserting user_shows after metadata upsert", async () => {
    const db = new FakeSupabase();

    const result = await addTmdbShowToLibrary({
      metadataClient: client(db),
      tmdbShow: buildTmdbShow(),
      userClient: client(db),
      userId: USER_ID,
    });

    expect(result).toMatchObject({
      episodeCount: 2,
      seasonCount: 2,
      status: "added",
      title: "Breaking Bad",
      tmdbId: SHOW_TMDB_ID,
    });
    expect(db.userShows).toEqual([
      expect.objectContaining({
        favourite: false,
        show_tmdb_id: SHOW_TMDB_ID,
        status: "watchlist",
        user_id: USER_ID,
      }),
    ]);

    const metadataUpsertIndexes = db.calls
      .map((call, index) => (call.method === "upsert" ? index : -1))
      .filter((index) => index >= 0);
    const userShowInsertIndex = db.calls.findIndex(
      (call) => call.method === "insert" && call.table === "user_shows",
    );

    expect(userShowInsertIndex).toBeGreaterThan(Math.max(...metadataUpsertIndexes));
  });

  it("keeps duplicate add-show behavior unchanged", async () => {
    const db = new FakeSupabase();
    db.userShows = [userShowRow({ show_tmdb_id: SHOW_TMDB_ID, user_id: USER_ID })];

    const result = await addTmdbShowToLibrary({
      metadataClient: client(db),
      tmdbShow: buildTmdbShow(),
      userClient: client(db),
      userId: USER_ID,
    });

    expect(result).toMatchObject({
      episodeCount: 2,
      seasonCount: 2,
      status: "duplicate",
      title: "Breaking Bad",
      tmdbId: SHOW_TMDB_ID,
    });
    expect(db.userShows).toHaveLength(1);
    expect(db.calls).toEqual([{ method: "select", table: "user_shows" }]);
  });
});

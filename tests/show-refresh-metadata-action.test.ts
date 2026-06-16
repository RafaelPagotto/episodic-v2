import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { refreshShowMetadataAction } from "../features/shows/actions";
import { getUserShowDetail } from "../features/shows/data";
import type { Database } from "../lib/supabase/types";
import type {
  NormalizedTmdbEpisode,
  NormalizedTmdbFullShow,
  NormalizedTmdbSeason,
} from "../lib/tmdb/types";

const revalidatePathMock = vi.hoisted(() => vi.fn());
const createSupabaseServerClientMock = vi.hoisted(() => vi.fn());
const createOptionalSupabaseServiceRoleClientMock = vi.hoisted(() => vi.fn());
const consumeTmdbRateLimitMock = vi.hoisted(() => vi.fn());
const getFullTmdbShowDetailsMock = vi.hoisted(() => vi.fn());

vi.mock("@/features/tracking/action-validation", () => ({
  isEpisodeWatchedActionInput: vi.fn(() => true),
  isSeasonWatchedActionInput: vi.fn(() => true),
  isShowTmdbId: vi.fn((value: unknown) => Number.isSafeInteger(value) && Number(value) > 0),
}));

vi.mock("@/features/search/data", async () => {
  const actual = await vi.importActual<typeof import("../features/search/data")>("../features/search/data");

  return {
    upsertTmdbShowMetadata: actual.upsertTmdbShowMetadata,
  };
});

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: createSupabaseServerClientMock,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createOptionalSupabaseServiceRoleClient: createOptionalSupabaseServiceRoleClientMock,
}));

vi.mock("@/lib/tmdb/rate-limit", () => ({
  consumeTmdbRateLimit: consumeTmdbRateLimitMock,
}));

vi.mock("@/lib/tmdb/server", () => ({
  getFullTmdbShowDetails: getFullTmdbShowDetailsMock,
}));

type EpisodeInsert = Database["public"]["Tables"]["episodes"]["Insert"];
type EpisodeRow = Database["public"]["Tables"]["episodes"]["Row"];
type SeasonInsert = Database["public"]["Tables"]["seasons"]["Insert"];
type SeasonRow = Database["public"]["Tables"]["seasons"]["Row"];
type ShowInsert = Database["public"]["Tables"]["shows"]["Insert"];
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
  error: { message?: string } | null;
};
type RecordedCall = {
  method: "insert" | "select" | "upsert";
  onConflict?: string;
  table: TableName;
};

const NOW = "2026-01-01T00:00:00.000Z";
const OLD_SYNCED_AT = "2026-01-02T00:00:00.000Z";
const SHOW_TMDB_ID = 1396;
const USER_ID = "user-1";

class FakeDatabase {
  episodes: EpisodeRow[] = [];
  failUpsertTable: TableName | null = null;
  seasons: SeasonRow[] = [];
  shows: ShowRow[] = [];
  userShows: UserShowRow[] = [];
  watchedEpisodes: WatchedEpisodeRow[] = [];

  private nextSeasonId = 1;

  getRows(table: TableName): AnyRow[] {
    if (table === "episodes") return this.episodes;
    if (table === "seasons") return this.seasons;
    if (table === "shows") return this.shows;
    if (table === "user_shows") return this.userShows;

    return this.watchedEpisodes;
  }

  upsertRows(table: TableName, values: unknown, onConflict: string): QueryResponse {
    if (this.failUpsertTable === table) {
      return {
        data: null,
        error: { message: "metadata write failed" },
      };
    }

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

    throw new Error(`Unexpected metadata upsert table: ${table}`);
  }
}

class FakeSupabase {
  auth = {
    getUser: vi.fn(),
  };
  calls: RecordedCall[] = [];

  constructor(readonly db: FakeDatabase) {}

  from(table: TableName) {
    return new FakeQuery(this, table);
  }
}

class FakeQuery {
  private readonly filters: QueryFilter[] = [];
  private limitCount: number | null = null;
  private readonly orders: QueryOrder[] = [];

  constructor(
    private readonly client: FakeSupabase,
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

  insert() {
    this.client.calls.push({ method: "insert", table: this.table });
    throw new Error(`Unexpected insert into ${this.table}`);
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
    this.client.calls.push({ method: "select", table: this.table });
    return this;
  }

  upsert(values: unknown, options: { onConflict?: string } = {}) {
    const onConflict = options.onConflict ?? "";
    this.client.calls.push({ method: "upsert", onConflict, table: this.table });

    return Promise.resolve(this.client.db.upsertRows(this.table, values, onConflict));
  }

  then<TResult1 = QueryResponse, TResult2 = never>(
    onfulfilled?: ((value: QueryResponse) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
  }

  private execute(rangeStart?: number, rangeEnd?: number): QueryResponse {
    let rows = this.client.db.getRows(this.table).filter((row) => matchesFilters(row, this.filters));

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

function actionClient(client: FakeSupabase): SupabaseClient<Database> {
  return client as unknown as SupabaseClient<Database>;
}

function setupRefreshAction({
  db = new FakeDatabase(),
  metadataClient = new FakeSupabase(db),
  tmdbShow = buildTmdbShow(),
  user = { id: USER_ID },
  userClient = new FakeSupabase(db),
}: {
  db?: FakeDatabase;
  metadataClient?: FakeSupabase | null;
  tmdbShow?: NormalizedTmdbFullShow;
  user?: { id: string } | null;
  userClient?: FakeSupabase;
} = {}) {
  userClient.auth.getUser.mockResolvedValue({
    data: { user },
    error: null,
  });
  createSupabaseServerClientMock.mockResolvedValue(userClient);
  createOptionalSupabaseServiceRoleClientMock.mockReturnValue(metadataClient);
  consumeTmdbRateLimitMock.mockReturnValue({ allowed: true, retryAfterSeconds: 0 });
  getFullTmdbShowDetailsMock.mockResolvedValue(tmdbShow);

  return {
    db,
    metadataClient,
    userClient,
  };
}

function buildTmdbShow({
  episodes = [tmdbEpisode(1, 1, "Updated Pilot"), tmdbEpisode(1, 2, "New Main Episode")],
  seasons = [tmdbSeason(1, 2)],
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

function tmdbEpisode(
  seasonNumber: number,
  episodeNumber: number,
  title = `S${seasonNumber}E${episodeNumber}`,
): NormalizedTmdbEpisode {
  return {
    airDate: "2026-03-01",
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

function seedLibraryShow(
  db: FakeDatabase,
  {
    favourite = true,
    status = "dropped",
  }: {
    favourite?: boolean;
    status?: UserShowRow["status"];
  } = {},
) {
  db.userShows = [
    {
      added_at: "2026-02-01T00:00:00.000Z",
      created_at: "2026-02-01T00:00:00.000Z",
      favourite,
      id: 1,
      show_tmdb_id: SHOW_TMDB_ID,
      status,
      status_updated_at: "2026-02-01T00:00:00.000Z",
      updated_at: "2026-02-01T00:00:00.000Z",
      user_id: USER_ID,
    },
  ];
}

function showRow(title = "Old Title"): ShowRow {
  return showRowFromInsert({
    backdrop_path: null,
    first_air_date: "2008-01-20",
    genres: [],
    last_air_date: null,
    last_synced_at: OLD_SYNCED_AT,
    metadata: {},
    original_language: "en",
    original_title: title,
    overview: null,
    popularity: null,
    poster_path: null,
    title,
    tmdb_id: SHOW_TMDB_ID,
    tmdb_status: "Ended",
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

function episodeRow(
  seasonNumber: number,
  episodeNumber: number,
  {
    airDate = "2026-01-01",
    runtimeMinutes = 42,
    title = `Old S${seasonNumber}E${episodeNumber}`,
  }: {
    airDate?: string | null;
    runtimeMinutes?: number | null;
    title?: string;
  } = {},
): EpisodeRow {
  return episodeRowFromInsert({
    air_date: airDate,
    episode_number: episodeNumber,
    last_synced_at: OLD_SYNCED_AT,
    metadata: {},
    overview: null,
    runtime_minutes: runtimeMinutes,
    season_number: seasonNumber,
    show_tmdb_id: SHOW_TMDB_ID,
    still_path: null,
    title,
    tmdb_id: SHOW_TMDB_ID * 1000000 + seasonNumber * 1000 + episodeNumber,
  });
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

const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

afterAll(() => {
  consoleErrorSpy.mockRestore();
});

beforeEach(() => {
  consoleErrorSpy.mockClear();
  revalidatePathMock.mockReset();
  createSupabaseServerClientMock.mockReset();
  createOptionalSupabaseServiceRoleClientMock.mockReset();
  consumeTmdbRateLimitMock.mockReset();
  getFullTmdbShowDetailsMock.mockReset();
});

describe("refreshShowMetadataAction", () => {
  it("requires authentication", async () => {
    setupRefreshAction({ user: null });

    const result = await refreshShowMetadataAction(SHOW_TMDB_ID);

    expect(result).toEqual({
      message: "Sign in to refresh metadata.",
      status: "error",
    });
    expect(consumeTmdbRateLimitMock).not.toHaveBeenCalled();
    expect(createOptionalSupabaseServiceRoleClientMock).not.toHaveBeenCalled();
    expect(getFullTmdbShowDetailsMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("requires the show to be in the current user's library", async () => {
    setupRefreshAction();

    const result = await refreshShowMetadataAction(SHOW_TMDB_ID);

    expect(result).toEqual({
      message: "This show is not in your library.",
      status: "error",
    });
    expect(consumeTmdbRateLimitMock).not.toHaveBeenCalled();
    expect(createOptionalSupabaseServiceRoleClientMock).not.toHaveBeenCalled();
    expect(getFullTmdbShowDetailsMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("rate-limits refresh separately before fetching TMDB details", async () => {
    const db = new FakeDatabase();
    seedLibraryShow(db);
    setupRefreshAction({ db });
    consumeTmdbRateLimitMock.mockReturnValue({ allowed: false, retryAfterSeconds: 30 });

    const result = await refreshShowMetadataAction(SHOW_TMDB_ID);

    expect(result).toEqual({
      message: "Too many requests. Try again shortly.",
      status: "error",
    });
    expect(consumeTmdbRateLimitMock).toHaveBeenCalledWith("refresh-show", USER_ID);
    expect(createOptionalSupabaseServiceRoleClientMock).not.toHaveBeenCalled();
    expect(getFullTmdbShowDetailsMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("uses service-role metadata writes while preserving user data and additive metadata rows", async () => {
    const db = new FakeDatabase();
    seedLibraryShow(db, { favourite: true, status: "dropped" });
    db.shows = [showRow()];
    db.seasons = [seasonRow(1), seasonRow(99, "Archived Season")];
    db.episodes = [
      episodeRow(1, 1),
      episodeRow(99, 1, { title: "Archived Episode" }),
    ];
    db.watchedEpisodes = [watchedEpisodeRow(1, 1)];
    const userShowsBefore = db.userShows.map((row) => ({ ...row }));
    const watchedEpisodesBefore = db.watchedEpisodes.map((row) => ({ ...row }));
    const metadataClient = new FakeSupabase(db);
    const userClient = new FakeSupabase(db);

    setupRefreshAction({
      db,
      metadataClient,
      tmdbShow: buildTmdbShow({
        episodes: [
          {
            ...tmdbEpisode(1, 1, "Updated Pilot"),
            airDate: "2026-04-01",
            runtimeMinutes: 61,
          },
          tmdbEpisode(1, 2, "New Main Episode"),
          tmdbEpisode(2, 1, "New Season Episode"),
        ],
        seasons: [tmdbSeason(1, 2, "Updated Season"), tmdbSeason(2, 1, "New Season")],
        title: "Updated Breaking Bad",
      }),
      userClient,
    });

    const result = await refreshShowMetadataAction(SHOW_TMDB_ID);

    expect(result).toEqual({
      message: "Refreshed metadata for Updated Breaking Bad.",
      status: "success",
    });
    expect(getFullTmdbShowDetailsMock).toHaveBeenCalledWith(SHOW_TMDB_ID);
    expect(createOptionalSupabaseServiceRoleClientMock).toHaveBeenCalledTimes(1);
    expect(consumeTmdbRateLimitMock).toHaveBeenCalledWith("refresh-show", USER_ID);
    expect(metadataClient.calls).toEqual([
      { method: "upsert", onConflict: "tmdb_id", table: "shows" },
      { method: "upsert", onConflict: "show_tmdb_id,season_number", table: "seasons" },
      { method: "upsert", onConflict: "show_tmdb_id,season_number,episode_number", table: "episodes" },
    ]);
    expect(userClient.calls).not.toEqual(expect.arrayContaining([expect.objectContaining({ method: "upsert" })]));

    expect(db.shows[0]).toEqual(expect.objectContaining({ title: "Updated Breaking Bad" }));
    expect(db.seasons.map((season) => `${season.season_number}:${season.name}`)).toEqual([
      "1:Updated Season",
      "99:Archived Season",
      "2:New Season",
    ]);
    expect(db.episodes.map((episode) => `${episode.season_number}:${episode.episode_number}:${episode.title}`)).toEqual([
      "1:1:Updated Pilot",
      "99:1:Archived Episode",
      "1:2:New Main Episode",
      "2:1:New Season Episode",
    ]);
    expect(db.episodes.find((episode) => episode.season_number === 1 && episode.episode_number === 1)).toEqual(
      expect.objectContaining({
        air_date: "2026-04-01",
        runtime_minutes: 61,
        title: "Updated Pilot",
      }),
    );
    expect(db.userShows).toEqual(userShowsBefore);
    expect(db.userShows[0]).toEqual(expect.objectContaining({ favourite: true, status: "dropped" }));
    expect(db.watchedEpisodes).toEqual(watchedEpisodesBefore);
    expect(db.watchedEpisodes).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ episode_number: 2, season_number: 1 }),
        expect.objectContaining({ episode_number: 1, season_number: 2 }),
      ]),
    );
    expect(revalidatePathMock).toHaveBeenCalledWith(`/shows/${SHOW_TMDB_ID}`);
    expect(revalidatePathMock).toHaveBeenCalledWith("/library");
    expect(revalidatePathMock).toHaveBeenCalledWith("/progress");
    expect(revalidatePathMock).toHaveBeenCalledWith("/dashboard");
  });

  it("returns a safe error and does not write metadata when TMDB fetch fails", async () => {
    const db = new FakeDatabase();
    seedLibraryShow(db);
    const metadataClient = new FakeSupabase(db);
    setupRefreshAction({ db, metadataClient });
    getFullTmdbShowDetailsMock.mockRejectedValue(new Error("upstream secret failure"));

    const result = await refreshShowMetadataAction(SHOW_TMDB_ID);

    expect(result).toEqual({
      message: "Unable to refresh metadata right now.",
      status: "error",
    });
    expect(result.message).not.toContain("secret");
    expect(metadataClient.calls).toEqual([]);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("returns a controlled error when metadata upsert fails", async () => {
    const db = new FakeDatabase();
    seedLibraryShow(db);
    db.failUpsertTable = "episodes";
    const metadataClient = new FakeSupabase(db);
    setupRefreshAction({ db, metadataClient });

    const result = await refreshShowMetadataAction(SHOW_TMDB_ID);

    expect(result).toEqual({
      message: "Unable to refresh metadata right now.",
      status: "error",
    });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("keeps refreshed Specials excluded from main progress", async () => {
    const db = new FakeDatabase();
    seedLibraryShow(db, { favourite: false, status: "watched" });
    db.shows = [showRow("Specials Show")];
    db.seasons = [seasonRow(1, "Season 1")];
    db.episodes = [episodeRow(1, 1, { title: "Main Episode" })];
    db.watchedEpisodes = [watchedEpisodeRow(1, 1)];
    const userClient = new FakeSupabase(db);

    setupRefreshAction({
      db,
      tmdbShow: buildTmdbShow({
        episodes: [
          tmdbEpisode(0, 1, "Special Episode"),
          tmdbEpisode(1, 1, "Main Episode"),
        ],
        seasons: [tmdbSeason(0, 1, "Specials"), tmdbSeason(1, 1, "Season 1")],
        title: "Specials Show",
      }),
      userClient,
    });

    const result = await refreshShowMetadataAction(SHOW_TMDB_ID);
    const show = await getUserShowDetail(actionClient(userClient), USER_ID, SHOW_TMDB_ID);

    expect(result.status).toBe("success");
    expect(show?.progress).toMatchObject({
      displayStatus: "completed",
      totalEpisodeCount: 1,
      watchedEpisodeCount: 1,
    });
    expect(show?.seasons.map((season) => season.seasonNumber)).toEqual([0, 1]);
    expect(show?.seasons[0]?.episodes).toHaveLength(1);
  });
});

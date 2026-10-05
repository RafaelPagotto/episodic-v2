import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { refreshScheduledTmdbShowMetadata } from "../features/shows/scheduled-metadata-refresh";
import { buildMetadataRefreshPlan } from "../features/shows/metadata-refresh-plan";
import type { Database } from "../lib/supabase/types";
import { createScheduledTmdbRequestControl } from "../lib/tmdb/scheduled-requests";
import type { TmdbTvDetailsResponse, TmdbTvSeasonDetailsResponse } from "../lib/tmdb/types";

vi.mock("server-only", () => ({}));
const fetchShow = vi.hoisted(() => vi.fn());
const fetchSeason = vi.hoisted(() => vi.fn());
vi.mock("../lib/tmdb/server", () => ({ getTmdbShowDetails: fetchShow, getTmdbSeasonDetails: fetchSeason }));

const now = new Date("2026-10-05T12:00:00Z");
const recent = "2026-10-01T12:00:00Z";
function rawShow(): TmdbTvDetailsResponse {
  return {
    id: 42, name: "Updated show", status: "Returning Series", last_episode_to_air: { season_number: 4 },
    seasons: Array.from({ length: 5 }, (_, season_number) => ({ id: 100 + season_number, season_number, episode_count: 1, air_date: "2020-01-01" })),
  };
}
function rawSeason(number: number): TmdbTvSeasonDetailsResponse {
  return { id: 100 + number, season_number: number, episodes: [
    { id: 200 + number, episode_number: 1, season_number: number, show_id: 42, name: "Updated episode", air_date: "2020-02-01", runtime: 45 },
  ] };
}
type Row = Record<string, unknown>;
function database() {
  const tables: Record<string, Row[]> = {
    shows: [{ tmdb_id: 42, last_synced_at: "2026-09-01T12:00:00Z" }],
    seasons: rawShow().seasons!.map((s) => ({ show_tmdb_id: 42, season_number: s.season_number!, tmdb_id: s.id!, episode_count: 1, metadata: { custom: true, episodesLastSyncedAt: recent } })),
    episodes: rawShow().seasons!.map((s) => ({ show_tmdb_id: 42, season_number: s.season_number!, episode_number: 1, tmdb_id: 200 + s.season_number!, air_date: "2020-01-01", title: "Old", last_synced_at: recent })),
    user_shows: [{ show_tmdb_id: 42, favourite: true, status: "dropped" }],
    watched_episodes: [{ show_tmdb_id: 42, season_number: 1, episode_number: 1 }],
  };
  const calls: { table: string; kind: string; rows?: Row[] }[] = [];
  let writeNumber = 0;
  let readNumber = 0;
  const failure = { atWrite: -1, atRead: -1 };
  const from = vi.fn((table: string) => {
    let payload: Row[] | undefined;
    let offset = 0;
    const query = {
      select: () => query, eq: () => query, order: () => query,
      range: (start: number) => { offset = start; return query; },
      upsert: (rows: Row[] | Row) => { payload = Array.isArray(rows) ? rows : [rows]; return query; },
      abortSignal: () => query,
      then: (resolve: (result: { data: Row[] | null; error: object | null }) => unknown) => {
        calls.push({ table, kind: payload ? "upsert" : "select", rows: payload });
        if (!payload) {
          readNumber++;
          return Promise.resolve(resolve(readNumber === failure.atRead
            ? { data: null, error: { message: "private snapshot error" } }
            : { data: tables[table].slice(offset, offset + 2), error: null }));
        }
        writeNumber++;
        if (writeNumber === failure.atWrite) return Promise.resolve(resolve({ data: null, error: { message: "private-db-error" } }));
        for (const row of payload) {
          const old = tables[table].find((r) => table === "shows" ? r.tmdb_id === row.tmdb_id
            : r.season_number === row.season_number && (table === "seasons" || r.episode_number === row.episode_number));
          if (old) Object.assign(old, structuredClone(row));
          else tables[table].push(structuredClone(row));
        }
        return Promise.resolve(resolve({ data: null, error: null }));
      },
    };
    return query;
  });
  return { client: { from } as unknown as SupabaseClient<Database>, tables, calls, failure, from };
}
function control() { return createScheduledTmdbRequestControl(now.getTime() + 240000); }

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  fetchShow.mockResolvedValue(rawShow());
  fetchSeason.mockImplementation(async (_id: number, number: number) => rawSeason(number));
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("selective scheduled metadata refresh", () => {
  it.each([0, -1, 1.5, NaN, "42"])("rejects invalid/non-numeric ID %s before any work", async (id) => {
    const db = database();
    await expect(refreshScheduledTmdbShowMetadata(id as number, db.client, control())).rejects.toThrow("Invalid TMDB show ID");
    expect(db.from).not.toHaveBeenCalled();
    expect(fetchShow).not.toHaveBeenCalled();
  });
  it.each([1, 5])("fails closed on season/episode snapshot failure at read %s", async (atRead) => {
    const db = database();
    db.failure.atRead = atRead;
    await expect(refreshScheduledTmdbShowMetadata(42, db.client, control())).rejects.toThrow("snapshot");
    expect(fetchShow).not.toHaveBeenCalled();
    expect(db.calls.some((c) => c.kind === "upsert")).toBe(false);
  });
  it("paginates baselines, updates summaries and selected details, preserves skipped details and user state", async () => {
    const db = database();
    const before = structuredClone(db.tables);
    await refreshScheduledTmdbShowMetadata(42, db.client, control());
    expect(fetchSeason.mock.calls.map((c) => c[1])).toEqual([3, 4]);
    expect(db.calls.filter((c) => c.kind === "select")).toHaveLength(8);
    expect(db.tables.episodes.slice(0, 3)).toEqual(before.episodes.slice(0, 3));
    expect(db.tables.episodes[3]).toMatchObject({ title: "Updated episode", air_date: "2020-02-01", runtime_minutes: 45 });
    expect(db.tables.seasons[1]).toMatchObject({ last_synced_at: now.toISOString(), metadata: { custom: true, episodesLastSyncedAt: recent } });
    expect(db.tables.seasons[3]).toMatchObject({ metadata: { custom: true, episodesLastSyncedAt: now.toISOString(), episodesRefreshPending: false } });
    expect(db.tables.user_shows).toEqual(before.user_shows);
    expect(db.tables.watched_episodes).toEqual(before.watched_episodes);
    expect(db.from.mock.calls.flat()).not.toContain("user_shows");
    expect(db.from.mock.calls.flat()).not.toContain("watched_episodes");
    expect(db.calls.at(-1)).toMatchObject({ table: "shows", kind: "upsert" });
    expect(db.tables.shows[0].last_synced_at).toBe(now.toISOString());
  });
  it("fetches count changes before overwriting the baseline and imports new seasons/episodes", async () => {
    const db = database();
    const show = rawShow();
    show.seasons![1].episode_count = 2;
    show.seasons!.push({ id: 105, season_number: 5, episode_count: 1, air_date: "2027-01-01" });
    fetchShow.mockResolvedValue(show);
    fetchSeason.mockImplementation(async (_id: number, number: number) => {
      const detail = rawSeason(number);
      if (number === 1) detail.episodes!.push({ id: 300, season_number: 1, episode_number: 2, name: "New" });
      return detail;
    });
    await refreshScheduledTmdbShowMetadata(42, db.client, control());
    expect(fetchSeason.mock.calls.map((c) => c[1])).toEqual([1, 3, 4, 5]);
    expect(db.tables.seasons.find((s) => s.season_number === 1)?.episode_count).toBe(2);
    expect(db.tables.episodes).toHaveLength(7);
    expect(db.tables.watched_episodes).toHaveLength(1);
  });
  it("performs a full detail refresh on an active-to-inactive transition", async () => {
    const db = database();
    fetchShow.mockResolvedValue({ ...rawShow(), status: " Ended " });
    await refreshScheduledTmdbShowMetadata(42, db.client, control());
    expect(fetchSeason.mock.calls.map((c) => c[1])).toEqual([0, 1, 2, 3, 4]);
    expect(db.tables.shows[0].tmdb_status).toBe("Ended");
  });
  it("retains missing seasons/episodes and uses upstream counts rather than retained row totals", async () => {
    const db = database();
    const show = rawShow();
    show.seasons = show.seasons!.filter((s) => s.season_number !== 2);
    show.seasons[1].episode_count = 0;
    fetchShow.mockResolvedValue(show);
    fetchSeason.mockImplementation(async (_id: number, number: number) => number === 1 ? { id: 101, season_number: 1, episodes: [] } : rawSeason(number));
    await refreshScheduledTmdbShowMetadata(42, db.client, control());
    expect(db.tables.seasons).toHaveLength(5);
    expect(db.tables.episodes).toHaveLength(5);
    expect(db.tables.seasons[1].episode_count).toBe(0);
    expect(db.tables.episodes[1].title).toBe("Old");
  });
  it.each([1, 2, 3, 4])("does not advance show freshness on write failure %s", async (atWrite) => {
    const db = database();
    const before = db.tables.shows[0].last_synced_at;
    db.failure.atWrite = atWrite;
    await expect(refreshScheduledTmdbShowMetadata(42, db.client, control())).rejects.toThrow();
    expect(db.tables.shows[0].last_synced_at).toBe(before);
    if (atWrite === 2 || atWrite === 3) {
      expect(db.tables.seasons[3].metadata).toMatchObject({ episodesLastSyncedAt: recent, episodesRefreshPending: true });
    }
  });
  it("retries changed historical details after summary succeeds but episode write fails", async () => {
    const db = database();
    db.tables.seasons[1].episode_count = 0;
    db.failure.atWrite = 2;
    await expect(refreshScheduledTmdbShowMetadata(42, db.client, control())).rejects.toThrow();
    const seasons = db.tables.seasons as unknown as Parameters<typeof buildMetadataRefreshPlan>[1];
    const episodes = db.tables.episodes as unknown as Parameters<typeof buildMetadataRefreshPlan>[2];
    expect(buildMetadataRefreshPlan(rawShow(), seasons, episodes, now).find((s) => s.seasonNumber === 1)?.reasons).toContain("detail-refresh-pending");
  });
  it("keeps pending detail state and stale show freshness after a later episode chunk fails", async () => {
    const db = database();
    const show = rawShow();
    show.seasons![3].episode_count = 501;
    fetchShow.mockResolvedValue(show);
    fetchSeason.mockImplementation(async (_id: number, number: number) => number === 3
      ? { id: 103, season_number: 3, episodes: Array.from({ length: 501 }, (_, index) => ({
        id: index === 0 ? 203 : 1000 + index, season_number: 3, episode_number: index + 1, name: "New episode",
      })) }
      : rawSeason(number));
    db.failure.atWrite = 3;
    await expect(refreshScheduledTmdbShowMetadata(42, db.client, control())).rejects.toThrow("episode details");
    expect(db.calls.filter((c) => c.table === "episodes" && c.kind === "upsert").map((c) => c.rows!.length)).toEqual([500, 2]);
    expect(db.tables.episodes).toHaveLength(504);
    expect(db.tables.seasons[3].metadata).toMatchObject({ episodesLastSyncedAt: recent, episodesRefreshPending: true });
    expect(db.tables.shows[0].last_synced_at).toBe("2026-09-01T12:00:00Z");
  });
  it.each(["show", "season", "incomplete", "identity", "renumber", "season-identity", "wrong-season"])("does not write on invalid/upstream %s failure", async (kind) => {
    const db = database();
    if (kind === "show") fetchShow.mockRejectedValue(new Error("private TMDB error"));
    else if (kind === "season") fetchSeason.mockRejectedValue(new Error("private season error"));
    else if (kind === "season-identity") fetchShow.mockResolvedValue({ ...rawShow(), seasons: [{ id: 999, season_number: 1, episode_count: 1 }] });
    else fetchSeason.mockImplementation(async (_id: number, number: number) => {
      const detail = rawSeason(number);
      if (kind === "incomplete") detail.episodes = [];
      if (kind === "identity") detail.episodes![0].id = 999;
      if (kind === "renumber") detail.episodes![0].id = 201;
      if (kind === "wrong-season") detail.season_number = 0;
      return detail;
    });
    await expect(refreshScheduledTmdbShowMetadata(42, db.client, control())).rejects.toThrow();
    expect(db.calls.some((c) => c.kind === "upsert")).toBe(false);
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("private");
  });
  it("rejects malformed/duplicate summaries before season fetches", async () => {
    const db = database();
    const show = rawShow();
    show.seasons!.push(show.seasons![0]);
    fetchShow.mockResolvedValue(show);
    await expect(refreshScheduledTmdbShowMetadata(42, db.client, control())).rejects.toThrow();
    expect(fetchSeason).not.toHaveBeenCalled();
    expect(db.calls.some((c) => c.kind === "upsert")).toBe(false);
  });
  it("caps season concurrency at five and drains siblings before reporting failure", async () => {
    const db = database();
    db.tables.seasons = [];
    const show = rawShow();
    show.seasons!.push({ id: 105, season_number: 5, episode_count: 1 });
    fetchShow.mockResolvedValue(show);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    fetchSeason.mockImplementation(async (_id: number, number: number) => {
      if (number === 0) throw new Error("upstream failure");
      await gate;
      return rawSeason(number);
    });
    let settled = false;
    const pending = refreshScheduledTmdbShowMetadata(42, db.client, control()).catch(() => { settled = true; });
    await vi.waitFor(() => expect(fetchSeason).toHaveBeenCalledTimes(5));
    expect(settled).toBe(false);
    release();
    await pending;
    expect(settled).toBe(true);
    expect(fetchSeason).toHaveBeenCalledTimes(5);
    expect(db.calls.some((c) => c.kind === "upsert")).toBe(false);
  });
  it("fails without work when the invocation no longer has fetch/write headroom", async () => {
    const db = database();
    await expect(refreshScheduledTmdbShowMetadata(42, db.client, createScheduledTmdbRequestControl(now.getTime() + 1000))).rejects.toThrow("time budget");
    expect(db.from).not.toHaveBeenCalled();
    expect(fetchShow).not.toHaveBeenCalled();
  });
});

import { describe, expect, it } from "vitest";

import { buildMetadataRefreshPlan } from "../features/shows/metadata-refresh-plan";
import type { StoredRefreshEpisode, StoredRefreshSeason } from "../features/shows/metadata-refresh-plan";
import type { TmdbTvDetailsResponse } from "../lib/tmdb/types";

const now = new Date("2026-10-05T12:00:00Z");
const recent = "2026-10-01T12:00:00Z";
const show: TmdbTvDetailsResponse = {
  id: 42, name: "Show", status: "Returning Series", last_episode_to_air: { season_number: 4 },
  seasons: Array.from({ length: 5 }, (_, season_number) => ({
    id: 100 + season_number, season_number, episode_count: 1, air_date: "2020-01-01",
  })),
};
function seasons(): StoredRefreshSeason[] {
  return show.seasons!.map((s) => ({
    season_number: s.season_number!, tmdb_id: s.id!, episode_count: 1,
    metadata: { episodesLastSyncedAt: recent },
  }));
}
function episodes(): StoredRefreshEpisode[] {
  return show.seasons!.map((s) => ({ season_number: s.season_number!, episode_number: 1, tmdb_id: 200 + s.season_number!, air_date: "2020-01-01" }));
}
function plan(details = show, stored = seasons(), rows = episodes()) {
  return buildMetadataRefreshPlan(details, stored, rows, now);
}

describe("scheduled metadata detail plan", () => {
  it("fetches current plus previous main seasons and skips unchanged history and Specials", () => {
    expect(plan().map((s) => s.seasonNumber)).toEqual([3, 4]);
  });
  it("keeps the airing anchor when an announced higher season exists", () => {
    const details = { ...show, seasons: [...show.seasons!, { id: 105, season_number: 5, episode_count: 0, air_date: "2027-01-01" }] };
    expect(plan(details).map((s) => s.seasonNumber)).toEqual([3, 4, 5]);
  });
  it("includes last and next airing seasons plus predecessor and falls back to highest main seasons", () => {
    expect(plan({ ...show, last_episode_to_air: { season_number: 1 }, next_episode_to_air: { season_number: 3 } }).map((s) => s.seasonNumber)).toEqual([1, 2, 3]);
    expect(plan({ ...show, last_episode_to_air: null }).map((s) => s.seasonNumber)).toEqual([3, 4]);
  });
  it.each([" Ended ", "CANCELED", "cancelled"])("uses fetched lifecycle %s to fully refresh including Specials", (status) => {
    expect(plan({ ...show, status }).map((s) => s.seasonNumber)).toEqual([0, 1, 2, 3, 4]);
  });
  it.each([null, "unrecognized", " Planned "])("treats lifecycle %s as active/unknown", (status) => {
    expect(plan({ ...show, status: status ?? undefined }).map((s) => s.seasonNumber)).toEqual([3, 4]);
  });
  it("fetches new seasons, count changes, and catalogue shortfalls, including Specials", () => {
    const stored = seasons().filter((s) => s.season_number !== 1);
    stored[0].episode_count = 2;
    expect(plan(show, stored, episodes().filter((e) => e.season_number !== 2)).map((s) => s.seasonNumber)).toEqual([0, 1, 2, 3, 4]);
  });
  it.each([null, {}, { episodesLastSyncedAt: "invalid" }, { episodesLastSyncedAt: recent, episodesRefreshPending: true }])("recovers missing/invalid/pending detail state %j", (metadata) => {
    const stored = seasons();
    stored[0].metadata = metadata;
    expect(plan(show, stored)[0].seasonNumber).toBe(0);
  });
  it("periodically fetches same-count history at the inclusive 180-day boundary", () => {
    const stored = seasons();
    stored[0].metadata = { episodesLastSyncedAt: new Date(now.getTime() - 180 * 86400000).toISOString() };
    stored[1].metadata = { episodesLastSyncedAt: new Date(now.getTime() - 180 * 86400000 + 1).toISOString() };
    expect(plan(show, stored).map((s) => s.seasonNumber)).toEqual([0, 3, 4]);
  });
  it.each([null, "not-a-date", "2027-07-01"])("refreshes unresolved old main-season episode dates %s", (air_date) => {
    const rows = episodes();
    rows[1].air_date = air_date;
    expect(plan(show, seasons(), rows).map((s) => s.seasonNumber)).toEqual([1, 3, 4]);
  });
  it("does not treat a same-day date or unresolved Specials as main-series scheduling signals", () => {
    const rows = episodes();
    rows[0].air_date = null;
    rows[1].air_date = "2026-10-05";
    expect(plan(show, seasons(), rows).map((s) => s.seasonNumber)).toEqual([3, 4]);
  });
});

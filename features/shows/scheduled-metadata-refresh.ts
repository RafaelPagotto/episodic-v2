import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "../../lib/supabase/types";
import { normalizeFullShowDetails } from "../../lib/tmdb/normalize";
import { getTmdbSeasonDetails, getTmdbShowDetails } from "../../lib/tmdb/server";
import type { TmdbRequestControl } from "../../lib/tmdb/scheduled-requests";
import type { TmdbTvDetailsResponse, TmdbTvSeasonDetailsResponse } from "../../lib/tmdb/types";
import { validateTmdbId } from "../../lib/tmdb/validation";
import { mapTmdbEpisodeToEpisodeInsert, mapTmdbSeasonToSeasonInsert, mapTmdbShowToShowInsert } from "../search/mappers";
import { buildMetadataRefreshPlan, metadataObject } from "./metadata-refresh-plan";
import type { StoredRefreshEpisode, StoredRefreshSeason } from "./metadata-refresh-plan";

const PAGE_SIZE = 1000;
const SEASON_CONCURRENCY = 5;

function positiveId(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function validateSummary(show: TmdbTvDetailsResponse, tmdbId: number, stored: StoredRefreshSeason[]) {
  if (!show || show.id !== tmdbId || !(show.name || show.original_name)?.trim() || !Array.isArray(show.seasons)) {
    throw new Error("Invalid TMDB show response.");
  }
  const numbers = new Set<number>();
  const ids = new Set<number>();
  for (const season of show.seasons) {
    const number = season?.season_number;
    if (typeof number !== "number" || !Number.isSafeInteger(number) || number < 0
      || !positiveId(season.id) || numbers.has(number) || ids.has(season.id)
      || typeof season.episode_count !== "number" || !Number.isSafeInteger(season.episode_count) || season.episode_count < 0) {
      throw new Error("Invalid TMDB season summary.");
    }
    if (stored.some((s) => (s.season_number === number && s.tmdb_id !== null && s.tmdb_id !== season.id)
      || (s.tmdb_id === season.id && s.season_number !== number))) {
      throw new Error("TMDB season identity changed.");
    }
    numbers.add(number);
    ids.add(season.id);
  }
}

function validateDetails(show: TmdbTvDetailsResponse, details: TmdbTvSeasonDetailsResponse[], stored: StoredRefreshEpisode[]) {
  const incomingIds = new Set<number>();
  const byCoordinate = new Map(stored.map((e) => [`${e.season_number}:${e.episode_number}`, e]));
  const byId = new Map(stored.filter((e) => e.tmdb_id !== null).map((e) => [e.tmdb_id, e]));
  for (const detail of details) {
    const summary = show.seasons!.find((s) => s.season_number === detail?.season_number);
    if (!summary || detail.id !== summary.id || !Array.isArray(detail.episodes)
      || detail.episodes.length < summary.episode_count!) {
      throw new Error("Invalid or incomplete TMDB season details.");
    }
    const numbers = new Set<number>();
    for (const episode of detail.episodes) {
      if (!episode || !positiveId(episode.id) || !positiveId(episode.episode_number)
        || episode.season_number !== detail.season_number
        || (episode.show_id !== undefined && episode.show_id !== show.id)
        || numbers.has(episode.episode_number) || incomingIds.has(episode.id)) {
        throw new Error("Invalid TMDB episode details.");
      }
      const old = byCoordinate.get(`${episode.season_number}:${episode.episode_number}`);
      const oldIdentity = byId.get(episode.id);
      if ((old?.tmdb_id != null && old.tmdb_id !== episode.id)
        || (oldIdentity && (oldIdentity.season_number !== episode.season_number || oldIdentity.episode_number !== episode.episode_number))) {
        throw new Error("TMDB episode identity changed.");
      }
      numbers.add(episode.episode_number);
      incomingIds.add(episode.id);
    }
  }
}

export async function refreshScheduledTmdbShowMetadata(
  tmdbId: number,
  metadataClient: SupabaseClient<Database>,
  control: TmdbRequestControl,
) {
  if (typeof tmdbId !== "number" || !validateTmdbId(tmdbId).ok) throw new Error("Invalid TMDB show ID.");
  const startedAt = Date.now();
  let stage = "snapshot";
  try {
    const seasons: StoredRefreshSeason[] = [];
    const episodes: StoredRefreshEpisode[] = [];
    // Snapshot counts before summary upserts; paginate to avoid Supabase row caps.
    for (let offset = 0; ; ) {
      control.checkTime();
      const { data, error } = await metadataClient.from("seasons")
        .select("season_number,tmdb_id,episode_count,metadata").eq("show_tmdb_id", tmdbId)
        .order("season_number").range(offset, offset + PAGE_SIZE - 1).abortSignal(control.databaseSignal());
      if (error || !data) throw new Error("Unable to read season snapshot.");
      seasons.push(...data);
      // Empty-page termination also works with a server row cap below PAGE_SIZE.
      if (!data.length) break;
      offset += data.length;
    }
    for (let offset = 0; ; ) {
      control.checkTime();
      const { data, error } = await metadataClient.from("episodes")
        .select("season_number,episode_number,tmdb_id,air_date").eq("show_tmdb_id", tmdbId)
        .order("season_number").order("episode_number").range(offset, offset + PAGE_SIZE - 1).abortSignal(control.databaseSignal());
      if (error || !data) throw new Error("Unable to read episode snapshot.");
      episodes.push(...data);
      if (!data.length) break;
      offset += data.length;
    }

    stage = "fetch";
    const show = await getTmdbShowDetails(tmdbId, { requestControl: control });
    validateSummary(show, tmdbId, seasons);
    const plan = buildMetadataRefreshPlan(show, seasons, episodes);
    console.info("[metadata-refresh-cron] Detail plan.", { tmdbId, seasons: plan });
    const details: TmdbTvSeasonDetailsResponse[] = [];
    for (let index = 0; index < plan.length; index += SEASON_CONCURRENCY) {
      const batch = plan.slice(index, index + SEASON_CONCURRENCY);
      const results = await Promise.allSettled(batch.map(async ({ seasonNumber }) => {
        const detail = await getTmdbSeasonDetails(tmdbId, seasonNumber, { requestControl: control });
        if (detail?.season_number !== seasonNumber) throw new Error("TMDB returned the wrong season.");
        return detail;
      }));
      const failure = results.find((result) => result.status === "rejected");
      if (failure?.status === "rejected") throw failure.reason;
      for (const result of results) if (result.status === "fulfilled") details.push(result.value);
    }
    validateDetails(show, details, episodes);
    const normalized = normalizeFullShowDetails(show, details);
    const lastSyncedAt = new Date().toISOString();
    const selected = new Set(plan.map((entry) => entry.seasonNumber));
    const stored = new Map(seasons.map((s) => [s.season_number, s]));
    const seasonRows = normalized.seasons.map((season) => {
      const summary = show.seasons!.find((s) => s.season_number === season.seasonNumber)!;
      return {
        ...mapTmdbSeasonToSeasonInsert(season, lastSyncedAt),
        episode_count: summary.episode_count!,
        metadata: {
          ...metadataObject(stored.get(season.seasonNumber)?.metadata ?? null),
          voteAverage: season.voteAverage,
          ...(selected.has(season.seasonNumber) ? { episodesRefreshPending: true } : {}),
        },
      };
    });
    control.checkTime();
    stage = "season-summaries";
    if (seasonRows.length) {
      const { error } = await metadataClient.from("seasons").upsert(seasonRows, { onConflict: "show_tmdb_id,season_number" })
        .abortSignal(control.databaseSignal());
      if (error) throw new Error("Unable to persist season summaries.");
    }
    stage = "episodes";
    const episodeRows = normalized.episodes.map((episode) => mapTmdbEpisodeToEpisodeInsert(episode, lastSyncedAt));
    for (let offset = 0; offset < episodeRows.length; offset += 500) {
      const { error } = await metadataClient.from("episodes").upsert(episodeRows.slice(offset, offset + 500), {
        onConflict: "show_tmdb_id,season_number,episode_number",
      }).abortSignal(control.databaseSignal());
      if (error) throw new Error("Unable to persist episode details.");
    }
    stage = "detail-markers";
    const completed = seasonRows.filter((s) => selected.has(s.season_number)).map((s) => ({
      ...s, metadata: { ...s.metadata, episodesRefreshPending: false, episodesLastSyncedAt: lastSyncedAt },
    }));
    if (completed.length) {
      const { error } = await metadataClient.from("seasons").upsert(completed, { onConflict: "show_tmdb_id,season_number" })
        .abortSignal(control.databaseSignal());
      if (error) throw new Error("Unable to persist detail-sync markers.");
    }
    stage = "show";
    const { error } = await metadataClient.from("shows").upsert(mapTmdbShowToShowInsert(normalized, lastSyncedAt), { onConflict: "tmdb_id" })
      .abortSignal(control.databaseSignal());
    if (error) throw new Error("Unable to persist show metadata.");
    console.info("[metadata-refresh-cron] Detail refresh completed.", { tmdbId, detailedSeasons: plan.length, elapsedMs: Date.now() - startedAt });
  } catch (error) {
    console.error("[metadata-refresh-cron] Detail refresh failed.", { tmdbId, stage, elapsedMs: Date.now() - startedAt });
    throw error;
  }
}

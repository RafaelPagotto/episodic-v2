import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";

import type { Episode, WatchedEpisode } from "./types";

export const MULTI_SHOW_EPISODE_PAGE_SIZE = 1000;

type EpisodicSupabaseClient = SupabaseClient<Database>;
type EpisodeRow = Database["public"]["Tables"]["episodes"]["Row"];
type WatchedEpisodeRow = Database["public"]["Tables"]["watched_episodes"]["Row"];

export class MultiShowEpisodeLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MultiShowEpisodeLoadError";
  }
}

export function mapEpisodeRow(row: EpisodeRow): Episode {
  return {
    airDate: row.air_date,
    episodeNumber: row.episode_number,
    metadata: {},
    overview: row.overview,
    runtimeMinutes: row.runtime_minutes,
    seasonNumber: row.season_number,
    showTmdbId: row.show_tmdb_id,
    stillPath: row.still_path,
    title: row.title,
    tmdbId: row.tmdb_id,
  };
}

export function mapWatchedEpisodeRow(row: WatchedEpisodeRow): WatchedEpisode {
  return {
    episodeNumber: row.episode_number,
    id: row.id,
    seasonNumber: row.season_number,
    showTmdbId: row.show_tmdb_id,
    userId: row.user_id,
    watchedAt: row.watched_at,
  };
}

function normalizeShowIds(showIds: number[]) {
  return Array.from(new Set(showIds)).sort((left, right) => left - right);
}

function groupByShowTmdbId<TRow extends { showTmdbId: number }>(rows: TRow[]) {
  return rows.reduce((groups, row) => {
    const currentRows = groups.get(row.showTmdbId) ?? [];
    currentRows.push(row);
    groups.set(row.showTmdbId, currentRows);
    return groups;
  }, new Map<number, TRow[]>());
}

export async function loadEpisodesByShowIds(
  supabase: EpisodicSupabaseClient,
  showIds: number[],
): Promise<Map<number, Episode[]>> {
  const normalizedShowIds = normalizeShowIds(showIds);

  if (normalizedShowIds.length === 0) {
    return new Map();
  }

  const rows: EpisodeRow[] = [];
  let rangeStart = 0;

  while (true) {
    const { data, error } = await supabase
      .from("episodes")
      .select("*")
      .in("show_tmdb_id", normalizedShowIds)
      .order("show_tmdb_id", { ascending: true })
      .order("season_number", { ascending: true })
      .order("episode_number", { ascending: true })
      .range(rangeStart, rangeStart + MULTI_SHOW_EPISODE_PAGE_SIZE - 1);

    if (error) {
      throw new MultiShowEpisodeLoadError("Unable to load episodes.");
    }

    const pageRows = data ?? [];
    rows.push(...pageRows);

    if (pageRows.length < MULTI_SHOW_EPISODE_PAGE_SIZE) {
      break;
    }

    rangeStart += MULTI_SHOW_EPISODE_PAGE_SIZE;
  }

  return groupByShowTmdbId(rows.map(mapEpisodeRow));
}

export async function loadWatchedEpisodesByShowIds(
  supabase: EpisodicSupabaseClient,
  userId: string,
  showIds: number[],
): Promise<Map<number, WatchedEpisode[]>> {
  const normalizedShowIds = normalizeShowIds(showIds);

  if (normalizedShowIds.length === 0) {
    return new Map();
  }

  const rows: WatchedEpisodeRow[] = [];
  let rangeStart = 0;

  while (true) {
    const { data, error } = await supabase
      .from("watched_episodes")
      .select("*")
      .eq("user_id", userId)
      .in("show_tmdb_id", normalizedShowIds)
      .order("show_tmdb_id", { ascending: true })
      .order("season_number", { ascending: true })
      .order("episode_number", { ascending: true })
      .range(rangeStart, rangeStart + MULTI_SHOW_EPISODE_PAGE_SIZE - 1);

    if (error) {
      throw new MultiShowEpisodeLoadError("Unable to load watched progress.");
    }

    const pageRows = data ?? [];
    rows.push(...pageRows);

    if (pageRows.length < MULTI_SHOW_EPISODE_PAGE_SIZE) {
      break;
    }

    rangeStart += MULTI_SHOW_EPISODE_PAGE_SIZE;
  }

  return groupByShowTmdbId(rows.map(mapWatchedEpisodeRow));
}

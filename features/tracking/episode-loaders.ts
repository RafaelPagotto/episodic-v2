import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";

import type { Episode, EpisodeProgress, EpisodeSummary, WatchedEpisode } from "./types";

export const MULTI_SHOW_EPISODE_PAGE_SIZE = 1000;
export const MULTI_SHOW_EPISODE_CONCURRENCY = 3;

const EPISODE_COLUMNS = "air_date,episode_number,overview,runtime_minutes,season_number,show_tmdb_id,still_path,title,tmdb_id";
const WATCHED_EPISODE_COLUMNS = "episode_number,id,season_number,show_tmdb_id,user_id,watched_at";

type EpisodicSupabaseClient = SupabaseClient<Database>;
type EpisodeRow = Database["public"]["Tables"]["episodes"]["Row"];
type WatchedEpisodeRow = Database["public"]["Tables"]["watched_episodes"]["Row"];
type LoadedEpisodeRow = Pick<EpisodeRow, "air_date" | "episode_number" | "overview" | "runtime_minutes" | "season_number" | "show_tmdb_id" | "still_path" | "title" | "tmdb_id">;
type LoadedWatchedEpisodeRow = Pick<WatchedEpisodeRow, "episode_number" | "id" | "season_number" | "show_tmdb_id" | "user_id" | "watched_at">;

export class MultiShowEpisodeLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MultiShowEpisodeLoadError";
  }
}

export function mapEpisodeRow(row: LoadedEpisodeRow): Episode {
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

export function mapWatchedEpisodeRow(row: LoadedWatchedEpisodeRow): WatchedEpisode {
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

type PageResponse<TRow> = {
  count?: number | null;
  data: TRow[] | null;
  error: { message?: string } | null;
};

async function loadAllPages<TRow>(
  readPage: (start: number, end: number, count: boolean) => PromiseLike<PageResponse<TRow>>,
  errorMessage: string,
): Promise<TRow[]> {
  const first = await readPage(0, MULTI_SHOW_EPISODE_PAGE_SIZE - 1, true);
  if (first.error) throw new MultiShowEpisodeLoadError(errorMessage);

  const rows = first.data ?? [];
  if (rows.length === 0) {
    if (first.count && first.count > 0) throw new MultiShowEpisodeLoadError(errorMessage);
    return rows;
  }

  // Use the actual page size in case the API's row limit is below 1,000.
  const pageSize = rows.length;
  if (typeof first.count === "number") {
    const totalCount = first.count;
    const pageCount = Math.ceil(totalCount / pageSize);
    const pages: TRow[][] = [rows];
    let nextPage = 1;
    let failed = false;
    const worker = async () => {
      try {
        while (!failed && nextPage < pageCount) {
          const pageIndex = nextPage++;
          const page = await readPage(pageIndex * pageSize, (pageIndex + 1) * pageSize - 1, false);
          if (page.error) throw new MultiShowEpisodeLoadError(errorMessage);
          const expectedLength = Math.min(pageSize, totalCount - pageIndex * pageSize);
          // A short response cannot satisfy the count used to schedule the pages.
          // Fail rather than calculate progress from incomplete data.
          if ((page.data?.length ?? 0) < expectedLength) throw new MultiShowEpisodeLoadError(errorMessage);
          pages[pageIndex] = page.data ?? [];
        }
      } catch (error) {
        failed = true;
        throw error;
      }
    };
    // Keep results in range order even when responses finish out of order.
    await Promise.all(Array.from({ length: Math.min(MULTI_SHOW_EPISODE_CONCURRENCY, pageCount - 1) }, worker));
    return pages.flat();
  }

  // Preserve complete pagination if an API response does not include a count.
  for (let start = pageSize; ; start += pageSize) {
    const page = await readPage(start, start + pageSize - 1, false);
    if (page.error) throw new MultiShowEpisodeLoadError(errorMessage);
    rows.push(...(page.data ?? []));
    if ((page.data?.length ?? 0) < pageSize) return rows;
  }
}

export async function loadEpisodesByShowIds(
  supabase: EpisodicSupabaseClient,
  showIds: number[],
): Promise<Map<number, Episode[]>> {
  const normalizedShowIds = normalizeShowIds(showIds);

  if (normalizedShowIds.length === 0) {
    return new Map();
  }

  const rows = await loadAllPages<LoadedEpisodeRow>(
    (start, end, count) => supabase
      .from("episodes")
      .select(EPISODE_COLUMNS, count ? { count: "exact" } : {})
      .in("show_tmdb_id", normalizedShowIds)
      .order("show_tmdb_id", { ascending: true })
      .order("season_number", { ascending: true })
      .order("episode_number", { ascending: true })
      .range(start, end),
    "Unable to load episodes.",
  );

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

  const rows = await loadAllPages<LoadedWatchedEpisodeRow>(
    (start, end, count) => supabase
      .from("watched_episodes")
      .select(WATCHED_EPISODE_COLUMNS, count ? { count: "exact" } : {})
      .eq("user_id", userId)
      .in("show_tmdb_id", normalizedShowIds)
      .order("show_tmdb_id", { ascending: true })
      .order("season_number", { ascending: true })
      .order("episode_number", { ascending: true })
      .range(start, end),
    "Unable to load watched progress.",
  );

  return groupByShowTmdbId(rows.map(mapWatchedEpisodeRow));
}

export async function loadEpisodeProgressByShowIds(
  supabase: EpisodicSupabaseClient,
  showIds: number[],
): Promise<Map<number, EpisodeProgress[]>> {
  const normalizedShowIds = normalizeShowIds(showIds);
  if (normalizedShowIds.length === 0) return new Map();
  const rows = await loadAllPages<Pick<EpisodeRow, "air_date" | "episode_number" | "season_number" | "show_tmdb_id">>(
    (start, end, count) => supabase.from("episodes")
      .select("air_date,episode_number,season_number,show_tmdb_id", count ? { count: "exact" } : {})
      .in("show_tmdb_id", normalizedShowIds)
      .order("show_tmdb_id", { ascending: true })
      .order("season_number", { ascending: true })
      .order("episode_number", { ascending: true })
      .range(start, end),
    "Unable to load episodes.",
  );
  return groupByShowTmdbId(rows.map((row) => ({
    airDate: row.air_date,
    episodeNumber: row.episode_number,
    seasonNumber: row.season_number,
    showTmdbId: row.show_tmdb_id,
  })));
}

export async function loadEpisodeSummariesByShowIds(
  supabase: EpisodicSupabaseClient,
  showIds: number[],
): Promise<Map<number, EpisodeSummary[]>> {
  const normalizedShowIds = normalizeShowIds(showIds);
  if (normalizedShowIds.length === 0) return new Map();
  const rows = await loadAllPages<Pick<EpisodeRow, "air_date" | "episode_number" | "season_number" | "show_tmdb_id" | "title">>(
    (start, end, count) => supabase.from("episodes")
      .select("air_date,episode_number,season_number,show_tmdb_id,title", count ? { count: "exact" } : {})
      .in("show_tmdb_id", normalizedShowIds)
      .order("show_tmdb_id", { ascending: true })
      .order("season_number", { ascending: true })
      .order("episode_number", { ascending: true })
      .range(start, end),
    "Unable to load episodes.",
  );
  return groupByShowTmdbId(rows.map((row) => ({
    airDate: row.air_date,
    episodeNumber: row.episode_number,
    seasonNumber: row.season_number,
    showTmdbId: row.show_tmdb_id,
    title: row.title,
  })));
}

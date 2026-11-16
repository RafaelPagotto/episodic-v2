import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { addDateOnlyDays, getDateOnlyForTimeZone } from "../../lib/date-only";
import type { Database } from "../../lib/supabase/types";
import { createScheduledTmdbRequestControl } from "../../lib/tmdb/scheduled-requests";
import type { TmdbRequestControl } from "../../lib/tmdb/scheduled-requests";
import { metadataRefreshRetryState } from "./metadata-refresh-retry";

const PAGE_SIZE = 1000;
const SHOW_ID_BATCH_SIZE = 100;
const DEFAULT_BATCH_SIZE = 25;
const MAX_BATCH_SIZE = 25;
const DAY_MS = 24 * 60 * 60 * 1000;
const ACTIVE_STALE_MS = 5 * DAY_MS;
const INACTIVE_STALE_MS = 180 * DAY_MS;
const INACTIVE_STATUSES = new Set(["ended", "canceled", "cancelled"]);
const RECENT_AIRING_DAYS = 14;
const UPCOMING_AIRING_DAYS = 7;

type MetadataClient = SupabaseClient<Database>;
type ShowMetadataRow = Pick<Database["public"]["Tables"]["shows"]["Row"], "tmdb_id" | "last_synced_at" | "tmdb_status" | "metadata">;

export type MetadataRefreshCandidate = {
  tmdbId: number;
  lastSyncedAt: string | null;
  tmdbStatus: string | null;
  metadata: ShowMetadataRow["metadata"];
};

export type MetadataRefreshCandidateOptions = {
  batchSize?: number;
  now?: Date;
  control?: TmdbRequestControl;
};

export class MetadataRefreshCandidateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MetadataRefreshCandidateError";
  }
}

async function loadEligibleShowIds(metadataClient: MetadataClient, control: TmdbRequestControl): Promise<number[]> {
  const showIds = new Set<number>();
  let rangeStart = 0;

  while (true) {
    control.checkTime();
    const { data, error } = await metadataClient
      .rpc("metadata_refresh_eligible_library_rows")
      // PostgREST needs the ordered column in the RPC record projection.
      .select("id,show_tmdb_id")
      .order("id", { ascending: true })
      .range(rangeStart, rangeStart + PAGE_SIZE - 1).abortSignal(control.databaseSignal());

    if (error || !data) {
      throw new MetadataRefreshCandidateError("Unable to load metadata refresh eligibility.");
    }
    if (data.length === 0) break;

    for (const row of data) showIds.add(row.show_tmdb_id);

    // Continue after short pages too: the server's row cap may be lower than PAGE_SIZE.
    rangeStart += data.length;
  }

  return [...showIds].sort((left, right) => left - right);
}

async function loadShowMetadata(metadataClient: MetadataClient, showIds: number[], control: TmdbRequestControl): Promise<ShowMetadataRow[]> {
  const rows: ShowMetadataRow[] = [];

  for (let index = 0; index < showIds.length; index += SHOW_ID_BATCH_SIZE) {
    const batchIds = showIds.slice(index, index + SHOW_ID_BATCH_SIZE);
    const remainingIds = new Set(batchIds);
    let rangeStart = 0;

    while (true) {
      control.checkTime();
      const { data, error } = await metadataClient
        .from("shows")
        .select("tmdb_id,last_synced_at,tmdb_status,metadata")
        .in("tmdb_id", batchIds)
        .order("tmdb_id", { ascending: true })
        .range(rangeStart, rangeStart + PAGE_SIZE - 1).abortSignal(control.databaseSignal());

      if (error || !data) {
        throw new MetadataRefreshCandidateError("Unable to load metadata refresh candidates.");
      }
      if (data.length === 0) break;

      for (const row of data) {
        if (!remainingIds.delete(row.tmdb_id)) {
          throw new MetadataRefreshCandidateError("Inconsistent metadata refresh candidate response.");
        }
        rows.push(row);
      }
      rangeStart += data.length;
    }

    if (remainingIds.size > 0) {
      throw new MetadataRefreshCandidateError("Incomplete metadata refresh candidate response.");
    }
  }

  return rows;
}

async function loadAiringShows(metadataClient: MetadataClient, showIds: number[], today: string, control: TmdbRequestControl) {
  const airing = new Map<number, boolean>();
  const from = addDateOnlyDays(today, -RECENT_AIRING_DAYS);
  const through = addDateOnlyDays(today, UPCOMING_AIRING_DAYS);
  for (let index = 0; index < showIds.length; index += SHOW_ID_BATCH_SIZE) {
    const batch = showIds.slice(index, index + SHOW_ID_BATCH_SIZE);
    for (let offset = 0; ; ) {
      control.checkTime();
      const { data, error } = await metadataClient.from("episodes")
        .select("show_tmdb_id,air_date,title,overview,runtime_minutes")
        .in("show_tmdb_id", batch).gt("season_number", 0)
        .gte("air_date", from).lte("air_date", through)
        .order("show_tmdb_id").order("season_number").order("episode_number")
        .range(offset, offset + PAGE_SIZE - 1).abortSignal(control.databaseSignal());
      if (error || !data) throw new MetadataRefreshCandidateError("Unable to load metadata refresh airing dates.");
      if (!data.length) break;
      for (const row of data) {
        const incomplete = row.air_date !== null && row.air_date <= today && (
          !row.overview?.trim() || !row.title.trim() || /^(Episode\s+\d+|TBA|TBD)$/i.test(row.title.trim())
          || row.runtime_minutes === null
        );
        airing.set(row.show_tmdb_id, Boolean(airing.get(row.show_tmdb_id)) || incomplete);
      }
      offset += data.length;
    }
  }
  return airing;
}

// The caller supplies a server-side metadata client with visibility across users' libraries.
export async function getMetadataRefreshCandidates(
  metadataClient: MetadataClient,
  { batchSize, now = new Date(), control = createScheduledTmdbRequestControl(Date.now() + 240_000) }: MetadataRefreshCandidateOptions = {},
): Promise<MetadataRefreshCandidate[]> {
  const nowMs = now.getTime();
  if (!Number.isFinite(nowMs)) {
    throw new MetadataRefreshCandidateError("Invalid metadata refresh reference time.");
  }
  const limit = typeof batchSize === "number" && Number.isInteger(batchSize) && batchSize >= 1
    ? Math.min(batchSize, MAX_BATCH_SIZE)
    : DEFAULT_BATCH_SIZE;
  const showIds = await loadEligibleShowIds(metadataClient, control);
  const rows = await loadShowMetadata(metadataClient, showIds, control);
  const airing = await loadAiringShows(metadataClient, showIds, getDateOnlyForTimeZone(now), control);
  control.checkTime();

  // last_synced_at can be fresh after a partial upsert failure; it is not a transaction success marker.
  const eligible = rows
    .map((row) => {
      const inactive = INACTIVE_STATUSES.has(row.tmdb_status?.trim().toLowerCase() ?? "");
      const syncedAt = row.last_synced_at === null ? null : Date.parse(row.last_synced_at);
      if (syncedAt !== null && !Number.isFinite(syncedAt)) {
        throw new MetadataRefreshCandidateError("Invalid metadata refresh timestamp.");
      }
      const retry = metadataRefreshRetryState(row.metadata);
      const isAiring = airing.has(row.tmdb_id);
      // UTC calendar days avoid skipping a day when Hobby's daily invocation
      // arrives earlier than yesterday's, or a manual refresh ran after it.
      const dueAt = syncedAt === null ? -Infinity : isAiring
        ? (Math.floor(syncedAt / DAY_MS) + 1) * DAY_MS
        : syncedAt + (inactive ? INACTIVE_STALE_MS : ACTIVE_STALE_MS);
      return { row, isAiring, incomplete: airing.get(row.tmdb_id) === true, syncedAt, dueAt: Math.max(dueAt, retry.retryAt ?? -Infinity) };
    })
    // Equality counts as stale, using one reference instant for the entire invocation.
    .filter(({ dueAt }) => dueAt <= nowMs)
    .sort((left, right) =>
      left.dueAt - right.dueAt
      || Number(right.incomplete) - Number(left.incomplete)
      || left.row.tmdb_id - right.row.tmdb_id,
    );
  const priority = eligible.filter((candidate) => candidate.isAiring);
  const background = eligible.filter((candidate) => !candidate.isAiring);
  const selected: typeof eligible = [];
  let priorityIndex = 0;
  let backgroundIndex = 0;
  // Four airing shows, then one background show; either queue can use unused
  // slots. Interleave execution too, so background work starts before the end.
  while (selected.length < limit && (priorityIndex < priority.length || backgroundIndex < background.length)) {
    if (backgroundIndex < background.length && (selected.length % 5 === 4 || priorityIndex >= priority.length)) {
      selected.push(background[backgroundIndex++]);
    } else {
      selected.push(priority[priorityIndex++]);
    }
  }
  return selected.map(({ row }) => ({
      tmdbId: row.tmdb_id,
      lastSyncedAt: row.last_synced_at,
      tmdbStatus: row.tmdb_status,
      metadata: row.metadata,
    }));
}

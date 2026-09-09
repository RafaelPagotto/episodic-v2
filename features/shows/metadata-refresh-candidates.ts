import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "../../lib/supabase/types";

const PAGE_SIZE = 1000;
const SHOW_ID_BATCH_SIZE = 100;
const DEFAULT_BATCH_SIZE = 5;
const MAX_BATCH_SIZE = 10;
const ACTIVE_STALE_MS = 24 * 60 * 60 * 1000;
const INACTIVE_STALE_MS = 30 * ACTIVE_STALE_MS;
const INACTIVE_STATUSES = new Set(["ended", "canceled", "cancelled"]);

type MetadataClient = SupabaseClient<Database>;
type ShowMetadataRow = Pick<Database["public"]["Tables"]["shows"]["Row"], "tmdb_id" | "last_synced_at" | "tmdb_status">;

export type MetadataRefreshCandidate = {
  tmdbId: number;
  lastSyncedAt: string | null;
  tmdbStatus: string | null;
};

export type MetadataRefreshCandidateOptions = {
  batchSize?: number;
  now?: Date;
};

export class MetadataRefreshCandidateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MetadataRefreshCandidateError";
  }
}

async function loadEligibleShowIds(metadataClient: MetadataClient): Promise<number[]> {
  const showIds = new Set<number>();
  let rangeStart = 0;

  while (true) {
    const { data, error } = await metadataClient
      .from("user_shows")
      .select("show_tmdb_id")
      .neq("status", "dropped")
      .order("id", { ascending: true })
      .range(rangeStart, rangeStart + PAGE_SIZE - 1);

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

async function loadShowMetadata(metadataClient: MetadataClient, showIds: number[]): Promise<ShowMetadataRow[]> {
  const rows: ShowMetadataRow[] = [];

  for (let index = 0; index < showIds.length; index += SHOW_ID_BATCH_SIZE) {
    const batchIds = showIds.slice(index, index + SHOW_ID_BATCH_SIZE);
    const remainingIds = new Set(batchIds);
    let rangeStart = 0;

    while (true) {
      const { data, error } = await metadataClient
        .from("shows")
        .select("tmdb_id,last_synced_at,tmdb_status")
        .in("tmdb_id", batchIds)
        .order("tmdb_id", { ascending: true })
        .range(rangeStart, rangeStart + PAGE_SIZE - 1);

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

// The caller supplies a server-side metadata client with visibility across users' libraries.
export async function getMetadataRefreshCandidates(
  metadataClient: MetadataClient,
  { batchSize, now = new Date() }: MetadataRefreshCandidateOptions = {},
): Promise<MetadataRefreshCandidate[]> {
  const nowMs = now.getTime();
  if (!Number.isFinite(nowMs)) {
    throw new MetadataRefreshCandidateError("Invalid metadata refresh reference time.");
  }
  const limit = typeof batchSize === "number" && Number.isInteger(batchSize) && batchSize >= 1
    ? Math.min(batchSize, MAX_BATCH_SIZE)
    : DEFAULT_BATCH_SIZE;
  const showIds = await loadEligibleShowIds(metadataClient);
  const rows = await loadShowMetadata(metadataClient, showIds);

  // last_synced_at can be fresh after a partial upsert failure; it is not a transaction success marker.
  return rows
    .map((row) => {
      const inactive = INACTIVE_STATUSES.has(row.tmdb_status?.trim().toLowerCase() ?? "");
      const syncedAt = row.last_synced_at === null ? null : Date.parse(row.last_synced_at);
      if (syncedAt !== null && !Number.isFinite(syncedAt)) {
        throw new MetadataRefreshCandidateError("Invalid metadata refresh timestamp.");
      }
      return { row, inactive, syncedAt };
    })
    // Equality counts as stale, using one reference instant for the entire invocation.
    .filter(({ inactive, syncedAt }) => syncedAt === null || nowMs - syncedAt >= (inactive ? INACTIVE_STALE_MS : ACTIVE_STALE_MS))
    .sort((left, right) =>
      Number(left.syncedAt !== null) - Number(right.syncedAt !== null)
      || Number(left.inactive) - Number(right.inactive)
      || (left.syncedAt ?? 0) - (right.syncedAt ?? 0)
      || left.row.tmdb_id - right.row.tmdb_id,
    )
    .slice(0, limit)
    .map(({ row }) => ({
      tmdbId: row.tmdb_id,
      lastSyncedAt: row.last_synced_at,
      tmdbStatus: row.tmdb_status,
    }));
}

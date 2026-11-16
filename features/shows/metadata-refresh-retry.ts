import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "../../lib/supabase/types";
import type { TmdbRequestControl } from "../../lib/tmdb/scheduled-requests";
import type { MetadataRefreshCandidate } from "./metadata-refresh-candidates";
import { metadataObject } from "./metadata-refresh-plan";

const DAY_MS = 86_400_000;

export function metadataRefreshRetryState(metadata: Json) {
  const state = metadataObject(metadata).scheduledRefreshRetry;
  const retry = metadataObject(state ?? null);
  const count = retry.failureCount;
  const retryAt = typeof retry.retryAt === "string" ? Date.parse(retry.retryAt) : NaN;
  return {
    failureCount: typeof count === "number" && Number.isSafeInteger(count) && count > 0 ? Math.min(count, 5) : 0,
    retryAt: Number.isFinite(retryAt) ? retryAt : null,
  };
}

// Reserve the retry window before work: timeouts/process termination must not
// leave an expensive or broken show at the front of every daily batch.
// The successful show upsert replaces metadata and therefore clears this state.
export async function beginScheduledMetadataRefresh(
  candidate: MetadataRefreshCandidate,
  metadataClient: SupabaseClient<Database>,
  control: TmdbRequestControl,
) {
  control.checkTime();
  const failureCount = Math.min(metadataRefreshRetryState(candidate.metadata).failureCount + 1, 5);
  const retryAt = new Date(Date.now() + Math.min(2 ** failureCount, 30) * DAY_MS).toISOString();
  const reservedMetadata = {
    ...metadataObject(candidate.metadata),
    scheduledRefreshRetry: { failureCount, retryAt },
  };
  let query = metadataClient.from("shows").update({
    metadata: reservedMetadata,
  }).eq("tmdb_id", candidate.tmdbId)
    .eq("metadata", JSON.stringify(candidate.metadata));
  // Compare both the snapshot and freshness so a concurrent refresh or reservation
  // cannot be overwritten with an older metadata object.
  query = candidate.lastSyncedAt === null
    ? query.is("last_synced_at", null)
    : query.eq("last_synced_at", candidate.lastSyncedAt);
  const { data, error } = await query.select("tmdb_id").abortSignal(control.databaseSignal());
  if (error || data?.length !== 1) throw new Error("Unable to reserve metadata refresh attempt.");

  // Configuration/authentication failures affect the whole batch, not this show.
  // Undo only our reservation; concurrent successful refreshes must survive.
  return async function cancelReservation() {
    let cancel = metadataClient.from("shows").update({ metadata: candidate.metadata })
      .eq("tmdb_id", candidate.tmdbId).eq("metadata", JSON.stringify(reservedMetadata));
    cancel = candidate.lastSyncedAt === null
      ? cancel.is("last_synced_at", null)
      : cancel.eq("last_synced_at", candidate.lastSyncedAt);
    const { error } = await cancel.select("tmdb_id").abortSignal(control.databaseSignal());
    if (error) throw new Error("Unable to release metadata refresh attempt.");
  };
}

import type { TrackingStatus } from "@/features/tracking";

export const CLEAR_WATCHED_HISTORY_RESET_STATUSES = [
  "watched",
  "watching",
] as const satisfies readonly TrackingStatus[];

export function getStatusAfterClearingWatchedHistory(status: TrackingStatus): TrackingStatus {
  return CLEAR_WATCHED_HISTORY_RESET_STATUSES.some((resetStatus) => resetStatus === status)
    ? "watchlist"
    : status;
}

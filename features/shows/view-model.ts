import type { DisplayStatus } from "@/features/tracking";

import type { ShowDetail } from "./types";

export const SHOW_DETAIL_STATUS_LABELS: Record<DisplayStatus, string> = {
  caught_up: "Caught up",
  completed: "Completed",
  dropped: "Dropped",
  watching: "Watching",
  watchlist: "Watchlist",
};

export function getShowDetailActionLabels(show: Pick<ShowDetail, "favourite" | "progress" | "title">) {
  const isDropped = show.progress.displayStatus === "dropped";

  return {
    droppedDescription:
      "Dropped overrides the displayed status, but your watched episode progress is preserved.",
    favouriteAriaLabel: show.favourite
      ? `Remove ${show.title} from favourites`
      : `Add ${show.title} to favourites`,
    favouriteButtonLabel: show.favourite ? "Unfavourite" : "Favourite",
    isDropped,
    statusLabel: SHOW_DETAIL_STATUS_LABELS[show.progress.displayStatus],
    toggleDroppedAriaLabel: isDropped ? `Resume ${show.title}` : `Drop ${show.title}`,
    toggleDroppedButtonLabel: isDropped ? "Resume" : "Drop",
  };
}

import { deriveDisplayStatus } from "../tracking";
import type { DisplayStatus, TrackingStatus } from "../tracking";

import type { LibraryFilter, LibraryShowCard, LibrarySortOption } from "./types";

export const LIBRARY_FILTERS: Array<{ label: string; value: LibraryFilter }> = [
  { label: "All", value: "all" },
  { label: "Watchlist", value: "watchlist" },
  { label: "Watching", value: "watching" },
  { label: "Caught up", value: "caught_up" },
  { label: "Completed", value: "completed" },
  { label: "Dropped", value: "dropped" },
  { label: "Favourites", value: "favourites" },
];

export const LIBRARY_SORT_OPTIONS: Array<{ label: string; value: LibrarySortOption }> = [
  { label: "Title", value: "title" },
  { label: "Date added", value: "added" },
  { label: "Progress", value: "progress" },
  { label: "Status", value: "status" },
];

export const DISPLAY_STATUS_LABELS: Record<DisplayStatus, string> = {
  caught_up: "Caught up",
  completed: "Completed",
  dropped: "Dropped",
  watching: "Watching",
  watchlist: "Watchlist",
};

const STATUS_SORT_ORDER: Record<DisplayStatus, number> = {
  watching: 0,
  watchlist: 1,
  caught_up: 2,
  completed: 3,
  dropped: 4,
};

export function filterLibraryShows(shows: LibraryShowCard[], filter: LibraryFilter) {
  if (filter === "all") {
    return shows;
  }

  if (filter === "favourites") {
    return shows.filter((show) => show.favourite);
  }

  return shows.filter((show) => show.displayStatus === filter);
}

export function sortLibraryShows(shows: LibraryShowCard[], sort: LibrarySortOption) {
  return [...shows].sort((left, right) => {
    if (sort === "added") {
      return new Date(right.addedAt).getTime() - new Date(left.addedAt).getTime();
    }

    if (sort === "progress") {
      return right.progressPercentage - left.progressPercentage || left.title.localeCompare(right.title);
    }

    if (sort === "status") {
      return (
        STATUS_SORT_ORDER[left.displayStatus] - STATUS_SORT_ORDER[right.displayStatus]
        || left.title.localeCompare(right.title)
      );
    }

    return left.title.localeCompare(right.title);
  });
}

export function filterAndSortLibraryShows(
  shows: LibraryShowCard[],
  filter: LibraryFilter,
  sort: LibrarySortOption,
) {
  return sortLibraryShows(filterLibraryShows(shows, filter), sort);
}

export function updateLibraryShowFavourite(show: LibraryShowCard, favourite: boolean): LibraryShowCard {
  return {
    ...show,
    favourite,
  };
}

export function updateLibraryShowDropped(
  show: LibraryShowCard,
  dropped: boolean,
  trackingStatus?: TrackingStatus,
): LibraryShowCard {
  const status = trackingStatus ?? (dropped ? "dropped" : "watchlist");

  return {
    ...show,
    displayStatus: deriveDisplayStatus({
      tmdbStatus: show.tmdbStatus,
      totalEpisodeCount: show.totalEpisodeCount,
      trackingStatus: status,
      watchedEpisodeCount: show.watchedEpisodeCount,
    }),
    status,
  };
}

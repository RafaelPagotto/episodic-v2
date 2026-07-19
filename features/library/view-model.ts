import {
  calculateProgressPercentage,
  deriveDisplayStatus,
  deriveTrackingStatusAfterProgressChange,
} from "../tracking";
import type { DisplayStatus, TrackingStatus } from "../tracking";

import type {
  LibraryFilter,
  LibraryShowCard,
  LibrarySortDirection,
  LibrarySortOption,
  LibraryViewMode,
} from "./types";
import { compareDateOnly, isDateOnly } from "../../lib/date-only";

export const LIBRARY_FILTERS: Array<{ label: string; value: LibraryFilter }> = [
  { label: "All", value: "all" },
  { label: "Watchlist", value: "watchlist" },
  { label: "Watching", value: "watching" },
  { label: "Caught up", value: "caught_up" },
  { label: "Completed", value: "completed" },
  { label: "Dropped", value: "dropped" },
  { label: "Favourites", value: "favourites" },
];

export const LIBRARY_SORT_CHOICES: Array<{
  direction: LibrarySortDirection;
  label: string;
  sort: LibrarySortOption;
  value: string;
}> = [
  { direction: "desc", label: "Date added: newest first", sort: "added", value: "added:desc" },
  { direction: "asc", label: "Date added: oldest first", sort: "added", value: "added:asc" },
  { direction: "desc", label: "Release date: newest first", sort: "release", value: "release:desc" },
  { direction: "asc", label: "Release date: oldest first", sort: "release", value: "release:asc" },
  { direction: "desc", label: "Progress: highest first", sort: "progress", value: "progress:desc" },
  { direction: "asc", label: "Progress: lowest first", sort: "progress", value: "progress:asc" },
  { direction: "asc", label: "Title: A-Z", sort: "title", value: "title:asc" },
  { direction: "desc", label: "Title: Z-A", sort: "title", value: "title:desc" },
  { direction: "asc", label: "Status: default order", sort: "status", value: "status:asc" },
  { direction: "desc", label: "Status: reverse order", sort: "status", value: "status:desc" },
];

export const LIBRARY_SORT_DIRECTION_STORAGE_KEY = "episodic.library.sortDirection";

export const LIBRARY_SORT_STORAGE_KEY = "episodic.library.sort";

export const LIBRARY_VIEW_MODE_STORAGE_KEY = "episodic.library.viewMode";

export const LIBRARY_VIEW_MODES: Array<{ label: string; value: LibraryViewMode }> = [
  { label: "Grid", value: "grid" },
  { label: "List", value: "list" },
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

export function isLibraryViewMode(value: unknown): value is LibraryViewMode {
  return value === "grid" || value === "list";
}

export function getInitialLibraryViewMode(storedValue: unknown): LibraryViewMode {
  return isLibraryViewMode(storedValue) ? storedValue : "grid";
}

export function isLibrarySortOption(value: unknown): value is LibrarySortOption {
  return (
    value === "added"
    || value === "progress"
    || value === "release"
    || value === "status"
    || value === "title"
  );
}

export function getInitialLibrarySortOption(storedValue: unknown): LibrarySortOption {
  return isLibrarySortOption(storedValue) ? storedValue : "added";
}

export function isLibrarySortDirection(value: unknown): value is LibrarySortDirection {
  return value === "asc" || value === "desc";
}

export function getDefaultLibrarySortDirection(sort: LibrarySortOption): LibrarySortDirection {
  return sort === "title" || sort === "status" ? "asc" : "desc";
}

export function getInitialLibrarySortDirection(
  storedValue: unknown,
  sort: LibrarySortOption = "added",
): LibrarySortDirection {
  return isLibrarySortDirection(storedValue) ? storedValue : getDefaultLibrarySortDirection(sort);
}

export function filterLibraryShows(shows: LibraryShowCard[], filter: LibraryFilter) {
  if (filter === "all") {
    return shows;
  }

  if (filter === "favourites") {
    return shows.filter((show) => show.favourite);
  }

  return shows.filter((show) => show.displayStatus === filter);
}

export function sortLibraryShows(
  shows: LibraryShowCard[],
  sort: LibrarySortOption,
  direction: LibrarySortDirection = getDefaultLibrarySortDirection(sort),
) {
  return [...shows].sort((left, right) => {
    if (sort === "added") {
      return compareDates(left.addedAt, right.addedAt, direction) || left.title.localeCompare(right.title);
    }

    if (sort === "release") {
      return compareDateOnlyValues(left.firstAirDate, right.firstAirDate, direction)
        || left.title.localeCompare(right.title);
    }

    if (sort === "progress") {
      return compareNumbers(left.progressPercentage, right.progressPercentage, direction)
        || left.title.localeCompare(right.title);
    }

    if (sort === "status") {
      return (
        compareNumbers(STATUS_SORT_ORDER[left.displayStatus], STATUS_SORT_ORDER[right.displayStatus], direction)
        || left.title.localeCompare(right.title)
      );
    }

    return compareNumbers(left.title.localeCompare(right.title), 0, direction);
  });
}

function compareNumbers(left: number, right: number, direction: LibrarySortDirection) {
  return direction === "asc" ? left - right : right - left;
}

function compareDates(left: string | null, right: string | null, direction: LibrarySortDirection) {
  const leftTime = getDateSortValue(left);
  const rightTime = getDateSortValue(right);

  if (leftTime === null && rightTime === null) {
    return 0;
  }

  if (leftTime === null) {
    return 1;
  }

  if (rightTime === null) {
    return -1;
  }

  return compareNumbers(leftTime, rightTime, direction);
}

function getDateSortValue(value: string | null) {
  if (!value) {
    return null;
  }

  const timestamp = new Date(value).getTime();

  return Number.isNaN(timestamp) ? null : timestamp;
}

function compareDateOnlyValues(left: string | null, right: string | null, direction: LibrarySortDirection) {
  const validLeft = isDateOnly(left) ? left : null;
  const validRight = isDateOnly(right) ? right : null;

  if (validLeft === null && validRight === null) {
    return 0;
  }

  if (validLeft === null) {
    return 1;
  }

  if (validRight === null) {
    return -1;
  }

  const comparison = compareDateOnly(validLeft, validRight);
  return direction === "asc" ? comparison : -comparison;
}

export function filterAndSortLibraryShows(
  shows: LibraryShowCard[],
  filter: LibraryFilter,
  sort: LibrarySortOption,
  direction?: LibrarySortDirection,
) {
  return sortLibraryShows(filterLibraryShows(shows, filter), sort, direction);
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

export function updateLibraryShowWatched(show: LibraryShowCard): LibraryShowCard {
  const watchedEpisodeCount = show.totalEpisodeCount;
  const status = deriveTrackingStatusAfterProgressChange({
    totalEpisodeCount: show.totalEpisodeCount,
    trackingStatus: show.status,
    watchedEpisodeCount,
  });

  return {
    ...show,
    displayStatus: deriveDisplayStatus({
      tmdbStatus: show.tmdbStatus,
      totalEpisodeCount: show.totalEpisodeCount,
      trackingStatus: status,
      watchedEpisodeCount,
    }),
    progressPercentage: calculateProgressPercentage({
      totalEpisodeCount: show.totalEpisodeCount,
      watchedEpisodeCount,
    }),
    status,
    watchedEpisodeCount,
  };
}

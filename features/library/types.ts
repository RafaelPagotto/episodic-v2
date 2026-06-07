import type { DisplayStatus, TrackingStatus } from "@/features/tracking";

export type LibraryFilter = "all" | "favourites" | DisplayStatus;

export type LibrarySortDirection = "asc" | "desc";

export type LibrarySortOption = "added" | "progress" | "release" | "status" | "title";

export type LibraryViewMode = "grid" | "list";

export type LibraryShowCard = {
  addedAt: string;
  displayStatus: DisplayStatus;
  favourite: boolean;
  firstAirDate: string | null;
  posterPath: string | null;
  progressPercentage: number;
  status: TrackingStatus;
  title: string;
  tmdbId: number;
  tmdbStatus: string | null;
  totalEpisodeCount: number;
  watchedEpisodeCount: number;
};

export type RemoveShowActionResult = {
  message: string;
  status: "error" | "success";
  tmdbId?: number;
};

export type UpdateFavouriteActionResult = RemoveShowActionResult & {
  favourite?: boolean;
};

export type UpdateDroppedActionResult = RemoveShowActionResult & {
  dropped?: boolean;
  trackingStatus?: TrackingStatus;
};

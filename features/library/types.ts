import type { DisplayStatus, TrackingStatus } from "@/features/tracking";

export type LibraryFilter = "all" | "favourites" | DisplayStatus;

export type LibrarySortOption = "added" | "progress" | "status" | "title";

export type LibraryShowCard = {
  addedAt: string;
  displayStatus: DisplayStatus;
  favourite: boolean;
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

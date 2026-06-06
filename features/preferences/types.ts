import type { DisplayStatus, LibrarySort, SortDirection, TrackingStatus } from "@/features/tracking";

export type UserPreferences = {
  fadeAdded: boolean;
  fadeDropped: boolean;
  hideAdded: boolean;
  hideCompleted: boolean;
  hideDropped: boolean;
  librarySort: LibrarySort;
  librarySortDirection: SortDirection;
  libraryStatusOrder: TrackingStatus[];
};

export type PreferenceAwareShow = {
  displayStatus: DisplayStatus;
};

export type PreferencesFormState = {
  message: string;
  status: "error" | "idle" | "success";
};

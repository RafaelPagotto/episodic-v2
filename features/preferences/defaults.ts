import type { UserPreferences } from "./types";

export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  fadeAdded: true,
  fadeDropped: true,
  hideAdded: false,
  hideCompleted: false,
  hideDropped: false,
  librarySort: "title",
  librarySortDirection: "asc",
  libraryStatusOrder: ["watching", "watchlist", "watched", "dropped"],
};

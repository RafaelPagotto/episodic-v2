import { describe, expect, it } from "vitest";

import {
  filterAndSortLibraryShows,
  filterLibraryShows,
  getDefaultLibrarySortDirection,
  getInitialLibrarySortDirection,
  getInitialLibrarySortOption,
  getInitialLibraryViewMode,
  isLibrarySortDirection,
  isLibrarySortOption,
  isLibraryViewMode,
  LIBRARY_SORT_CHOICES,
  sortLibraryShows,
  updateLibraryShowFavourite,
  updateLibraryShowDropped,
  updateLibraryShowWatched,
} from "../features/library/view-model";
import type { LibraryShowCard } from "../features/library";

function libraryShow(overrides: Partial<LibraryShowCard>): LibraryShowCard {
  return {
    addedAt: "2026-05-01T00:00:00.000Z",
    displayStatus: "watchlist",
    favourite: false,
    firstAirDate: "2020-01-01",
    posterPath: null,
    progressPercentage: 0,
    status: "watchlist",
    title: "Show",
    tmdbId: 1,
    tmdbStatus: "Returning Series",
    totalEpisodeCount: 10,
    watchedEpisodeCount: 0,
    ...overrides,
  };
}

describe("library view model", () => {
  const shows = [
    libraryShow({
      addedAt: "2026-05-03T00:00:00.000Z",
      displayStatus: "watching",
      favourite: true,
      firstAirDate: "2021-01-01",
      progressPercentage: 40,
      title: "Beta",
      tmdbId: 2,
      watchedEpisodeCount: 4,
    }),
    libraryShow({
      addedAt: "2026-05-01T00:00:00.000Z",
      displayStatus: "completed",
      firstAirDate: "2022-01-01",
      progressPercentage: 100,
      tmdbStatus: "Ended",
      title: "Alpha",
      tmdbId: 1,
      watchedEpisodeCount: 10,
    }),
    libraryShow({
      addedAt: "2026-05-02T00:00:00.000Z",
      displayStatus: "dropped",
      firstAirDate: null,
      progressPercentage: 10,
      title: "Gamma",
      tmdbId: 3,
      watchedEpisodeCount: 1,
    }),
  ];

  it("filters by display status and favourites", () => {
    expect(filterLibraryShows(shows, "watching").map((show) => show.title)).toEqual(["Beta"]);
    expect(filterLibraryShows(shows, "favourites").map((show) => show.title)).toEqual(["Beta"]);
  });

  it("sorts by title, added date, release date, progress, and status with default directions", () => {
    expect(sortLibraryShows(shows, "title").map((show) => show.title)).toEqual(["Alpha", "Beta", "Gamma"]);
    expect(sortLibraryShows(shows, "added").map((show) => show.title)).toEqual(["Beta", "Gamma", "Alpha"]);
    expect(sortLibraryShows(shows, "release").map((show) => show.title)).toEqual(["Alpha", "Beta", "Gamma"]);
    expect(sortLibraryShows(shows, "progress").map((show) => show.title)).toEqual(["Alpha", "Beta", "Gamma"]);
    expect(sortLibraryShows(shows, "status").map((show) => show.title)).toEqual(["Beta", "Alpha", "Gamma"]);
  });

  it("sorts with explicit ascending and descending directions", () => {
    expect(sortLibraryShows(shows, "title", "desc").map((show) => show.title)).toEqual([
      "Gamma",
      "Beta",
      "Alpha",
    ]);
    expect(sortLibraryShows(shows, "added", "asc").map((show) => show.title)).toEqual(["Alpha", "Gamma", "Beta"]);
    expect(sortLibraryShows(shows, "release", "asc").map((show) => show.title)).toEqual(["Beta", "Alpha", "Gamma"]);
    expect(sortLibraryShows(shows, "progress", "asc").map((show) => show.title)).toEqual([
      "Gamma",
      "Beta",
      "Alpha",
    ]);
    expect(sortLibraryShows(shows, "status", "desc").map((show) => show.title)).toEqual([
      "Gamma",
      "Alpha",
      "Beta",
    ]);
  });

  it("combines filtering and sorting", () => {
    expect(filterAndSortLibraryShows(shows, "all", "progress", "desc").map((show) => show.title)).toEqual([
      "Alpha",
      "Beta",
      "Gamma",
    ]);
  });

  it("defaults library view mode to grid when no valid local preference exists", () => {
    expect(getInitialLibraryViewMode(null)).toBe("grid");
    expect(getInitialLibraryViewMode(undefined)).toBe("grid");
    expect(getInitialLibraryViewMode("cards")).toBe("grid");
    expect(isLibraryViewMode("cards")).toBe(false);
  });

  it("defaults library sort to date added when no valid local preference exists", () => {
    expect(getInitialLibrarySortOption(null)).toBe("added");
    expect(getInitialLibrarySortOption(undefined)).toBe("added");
    expect(getInitialLibrarySortOption("latest")).toBe("added");
    expect(isLibrarySortOption("latest")).toBe(false);
  });

  it("defaults library sort direction by sort type when no valid local preference exists", () => {
    expect(getDefaultLibrarySortDirection("added")).toBe("desc");
    expect(getDefaultLibrarySortDirection("progress")).toBe("desc");
    expect(getDefaultLibrarySortDirection("release")).toBe("desc");
    expect(getDefaultLibrarySortDirection("status")).toBe("asc");
    expect(getDefaultLibrarySortDirection("title")).toBe("asc");
    expect(getInitialLibrarySortDirection(null, "title")).toBe("asc");
    expect(getInitialLibrarySortDirection(undefined, "added")).toBe("desc");
    expect(getInitialLibrarySortDirection("sideways", "progress")).toBe("desc");
    expect(isLibrarySortDirection("sideways")).toBe(false);
  });

  it("restores persisted grid and list library view modes", () => {
    expect(getInitialLibraryViewMode("grid")).toBe("grid");
    expect(getInitialLibraryViewMode("list")).toBe("list");
    expect(isLibraryViewMode("grid")).toBe(true);
    expect(isLibraryViewMode("list")).toBe(true);
  });

  it("restores persisted library sort options", () => {
    expect(getInitialLibrarySortOption("added")).toBe("added");
    expect(getInitialLibrarySortOption("progress")).toBe("progress");
    expect(getInitialLibrarySortOption("release")).toBe("release");
    expect(getInitialLibrarySortOption("status")).toBe("status");
    expect(getInitialLibrarySortOption("title")).toBe("title");
    expect(isLibrarySortOption("added")).toBe(true);
    expect(isLibrarySortOption("progress")).toBe(true);
    expect(isLibrarySortOption("release")).toBe(true);
    expect(isLibrarySortOption("status")).toBe(true);
    expect(isLibrarySortOption("title")).toBe(true);
  });

  it("restores persisted library sort directions", () => {
    expect(getInitialLibrarySortDirection("asc", "added")).toBe("asc");
    expect(getInitialLibrarySortDirection("desc", "title")).toBe("desc");
    expect(isLibrarySortDirection("asc")).toBe(true);
    expect(isLibrarySortDirection("desc")).toBe(true);
  });

  it("provides combined sort choices for every sort and direction pair", () => {
    expect(LIBRARY_SORT_CHOICES.map((choice) => choice.value)).toEqual([
      "added:desc",
      "added:asc",
      "release:desc",
      "release:asc",
      "progress:desc",
      "progress:asc",
      "title:asc",
      "title:desc",
      "status:asc",
      "status:desc",
    ]);
  });

  it("provides one filtered and sorted item order for grid and list layouts", () => {
    const visibleItems = filterAndSortLibraryShows(shows, "all", "status", "asc");

    expect(visibleItems.map((show) => show.title)).toEqual(["Beta", "Alpha", "Gamma"]);
  });

  it("updates favourite state without changing the rest of the card", () => {
    const show = libraryShow({ favourite: false, title: "Favourite me" });

    expect(updateLibraryShowFavourite(show, true)).toEqual({
      ...show,
      favourite: true,
    });
  });

  it("drops and resumes without deleting progress", () => {
    const show = libraryShow({
      displayStatus: "watching",
      progressPercentage: 40,
      status: "watching",
      watchedEpisodeCount: 4,
    });

    const dropped = updateLibraryShowDropped(show, true);
    const resumed = updateLibraryShowDropped(dropped, false, "watching");

    expect(dropped).toEqual({
      ...show,
      displayStatus: "dropped",
      status: "dropped",
    });
    expect(resumed).toEqual({
      ...show,
      displayStatus: "watching",
      status: "watching",
    });
    expect(resumed.watchedEpisodeCount).toBe(4);
    expect(resumed.progressPercentage).toBe(40);
  });

  it("resumes dropped shows according to progress and lifecycle", () => {
    expect(updateLibraryShowDropped(libraryShow({ watchedEpisodeCount: 0 }), false).displayStatus).toBe("watchlist");
    expect(updateLibraryShowDropped(libraryShow({ watchedEpisodeCount: 4 }), false, "watching").displayStatus).toBe(
      "watching",
    );
    expect(updateLibraryShowDropped(libraryShow({ watchedEpisodeCount: 10 }), false, "watched").displayStatus).toBe(
      "caught_up",
    );
    expect(
      updateLibraryShowDropped(libraryShow({ tmdbStatus: "Ended", watchedEpisodeCount: 10 }), false, "watched")
        .displayStatus,
    ).toBe("completed");
  });

  it("marks library card main progress watched using derived status", () => {
    const watchingShow = libraryShow({
      displayStatus: "watching",
      progressPercentage: 40,
      status: "watching",
      watchedEpisodeCount: 4,
    });
    const endedShow = libraryShow({
      displayStatus: "watching",
      progressPercentage: 40,
      status: "watching",
      tmdbStatus: "Ended",
      watchedEpisodeCount: 4,
    });

    expect(updateLibraryShowWatched(watchingShow)).toEqual({
      ...watchingShow,
      displayStatus: "caught_up",
      progressPercentage: 100,
      status: "watched",
      watchedEpisodeCount: 10,
    });
    expect(updateLibraryShowWatched(endedShow)).toEqual({
      ...endedShow,
      displayStatus: "completed",
      progressPercentage: 100,
      status: "watched",
      watchedEpisodeCount: 10,
    });
  });

  it("preserves dropped override when marking library card progress watched", () => {
    const show = libraryShow({
      displayStatus: "dropped",
      progressPercentage: 40,
      status: "dropped",
      watchedEpisodeCount: 4,
    });

    expect(updateLibraryShowWatched(show)).toEqual({
      ...show,
      displayStatus: "dropped",
      progressPercentage: 100,
      status: "dropped",
      watchedEpisodeCount: 10,
    });
  });
});

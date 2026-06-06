import { describe, expect, it } from "vitest";

import {
  filterAndSortLibraryShows,
  filterLibraryShows,
  sortLibraryShows,
  updateLibraryShowFavourite,
  updateLibraryShowDropped,
} from "../features/library/view-model";
import type { LibraryShowCard } from "../features/library";

function libraryShow(overrides: Partial<LibraryShowCard>): LibraryShowCard {
  return {
    addedAt: "2026-05-01T00:00:00.000Z",
    displayStatus: "watchlist",
    favourite: false,
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
      progressPercentage: 40,
      title: "Beta",
      tmdbId: 2,
      watchedEpisodeCount: 4,
    }),
    libraryShow({
      addedAt: "2026-05-01T00:00:00.000Z",
      displayStatus: "completed",
      progressPercentage: 100,
      tmdbStatus: "Ended",
      title: "Alpha",
      tmdbId: 1,
      watchedEpisodeCount: 10,
    }),
    libraryShow({
      addedAt: "2026-05-02T00:00:00.000Z",
      displayStatus: "dropped",
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

  it("sorts by title, added date, progress, and status", () => {
    expect(sortLibraryShows(shows, "title").map((show) => show.title)).toEqual(["Alpha", "Beta", "Gamma"]);
    expect(sortLibraryShows(shows, "added").map((show) => show.title)).toEqual(["Beta", "Gamma", "Alpha"]);
    expect(sortLibraryShows(shows, "progress").map((show) => show.title)).toEqual(["Alpha", "Beta", "Gamma"]);
    expect(sortLibraryShows(shows, "status").map((show) => show.title)).toEqual(["Beta", "Alpha", "Gamma"]);
  });

  it("combines filtering and sorting", () => {
    expect(filterAndSortLibraryShows(shows, "all", "progress").map((show) => show.title)).toEqual([
      "Alpha",
      "Beta",
      "Gamma",
    ]);
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
});

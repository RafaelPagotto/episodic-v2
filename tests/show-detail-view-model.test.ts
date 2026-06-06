import { describe, expect, it } from "vitest";

import { getShowDetailActionLabels, SHOW_DETAIL_STATUS_LABELS } from "../features/shows";
import type { ShowDetail } from "../features/shows";

function showDetail(overrides: Partial<ShowDetail>): ShowDetail {
  return {
    backdropPath: null,
    favourite: false,
    firstAirDate: null,
    overview: null,
    posterPath: null,
    progress: {
      displayStatus: "watching",
      progressPercentage: 50,
      status: "watching",
      totalEpisodeCount: 10,
      watchedEpisodeCount: 5,
    },
    seasons: [],
    title: "Arcane",
    tmdbId: 100,
    tmdbStatus: "Returning Series",
    ...overrides,
  };
}

describe("show detail view model", () => {
  it("labels favourite and unfavourite actions", () => {
    expect(getShowDetailActionLabels(showDetail({ favourite: false }))).toMatchObject({
      favouriteAriaLabel: "Add Arcane to favourites",
      favouriteButtonLabel: "Favourite",
    });

    expect(getShowDetailActionLabels(showDetail({ favourite: true }))).toMatchObject({
      favouriteAriaLabel: "Remove Arcane from favourites",
      favouriteButtonLabel: "Unfavourite",
    });
  });

  it("labels drop and resume according to derived display status", () => {
    expect(getShowDetailActionLabels(showDetail({}))).toMatchObject({
      isDropped: false,
      toggleDroppedAriaLabel: "Drop Arcane",
      toggleDroppedButtonLabel: "Drop",
    });

    expect(
      getShowDetailActionLabels(
        showDetail({
          progress: {
            displayStatus: "dropped",
            progressPercentage: 50,
            status: "dropped",
            totalEpisodeCount: 10,
            watchedEpisodeCount: 5,
          },
        }),
      ),
    ).toMatchObject({
      isDropped: true,
      toggleDroppedAriaLabel: "Resume Arcane",
      toggleDroppedButtonLabel: "Resume",
    });
  });

  it("keeps caught up and completed as display-only labels", () => {
    expect(SHOW_DETAIL_STATUS_LABELS.caught_up).toBe("Caught up");
    expect(SHOW_DETAIL_STATUS_LABELS.completed).toBe("Completed");
  });
});

import { describe, expect, it } from "vitest";

import { DEFAULT_USER_PREFERENCES } from "../features/preferences/defaults";
import {
  filterShowsForPreferences,
  PREFERENCE_ITEMS,
  shouldFadeAddedForPreferences,
  shouldFadeShowForPreferences,
  shouldHideAddedForPreferences,
} from "../features/preferences/view-model";
import type { PreferenceAwareShow, UserPreferences } from "../features/preferences/types";

function preferences(overrides: Partial<UserPreferences>): UserPreferences {
  return {
    ...DEFAULT_USER_PREFERENCES,
    ...overrides,
  };
}

function show(displayStatus: PreferenceAwareShow["displayStatus"]): PreferenceAwareShow {
  return {
    displayStatus,
  };
}

describe("preferences view model", () => {
  it("filters dropped and completed shows while keeping caught-up shows visible", () => {
    const shows = [show("watching"), show("caught_up"), show("completed"), show("watchlist"), show("dropped")];

    expect(
      filterShowsForPreferences(
        shows,
        preferences({
          hideCompleted: true,
          hideDropped: true,
        }),
      ),
    ).toEqual([show("watching"), show("caught_up"), show("watchlist")]);
  });

  it("describes derived-status and search-result preference scope", () => {
    expect(PREFERENCE_ITEMS).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          description: "Hide only completed ended shows. Caught-up ongoing shows remain visible.",
          label: "Hide completed shows only",
          name: "hideCompleted",
        }),
        expect.objectContaining({
          description: "Dim TMDB search results for shows already in your library.",
          label: "Fade added search results",
          name: "fadeAdded",
        }),
        expect.objectContaining({
          description: "Hide TMDB search results for shows already in your library.",
          label: "Hide added search results",
          name: "hideAdded",
        }),
      ]),
    );
  });

  it("fades dropped shows only when they are not hidden", () => {
    expect(
      shouldFadeShowForPreferences(
        show("dropped"),
        preferences({
          fadeDropped: true,
          hideDropped: false,
        }),
      ),
    ).toBe(true);
    expect(
      shouldFadeShowForPreferences(
        show("dropped"),
        preferences({
          fadeDropped: true,
          hideDropped: true,
        }),
      ),
    ).toBe(false);
  });

  it("handles already-added search result visibility", () => {
    expect(shouldHideAddedForPreferences(true, preferences({ hideAdded: true }))).toBe(true);
    expect(shouldHideAddedForPreferences(false, preferences({ hideAdded: true }))).toBe(false);
    expect(shouldFadeAddedForPreferences(true, preferences({ fadeAdded: true, hideAdded: false }))).toBe(true);
    expect(shouldFadeAddedForPreferences(true, preferences({ fadeAdded: true, hideAdded: true }))).toBe(false);
  });
});

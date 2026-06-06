import type { DisplayStatus } from "@/features/tracking";

import type { PreferenceAwareShow, UserPreferences } from "./types";

export const PREFERENCE_ITEMS: Array<{
  description: string;
  label: string;
  name: keyof Pick<
    UserPreferences,
    "fadeAdded" | "fadeDropped" | "hideAdded" | "hideCompleted" | "hideDropped"
  >;
}> = [
  {
    description: "Dim dropped shows in library, dashboard, and progress views while keeping them visible.",
    label: "Fade dropped shows",
    name: "fadeDropped",
  },
  {
    description: "Hide dropped shows from library, dashboard, and progress views.",
    label: "Hide dropped shows",
    name: "hideDropped",
  },
  {
    description: "Hide only completed ended shows. Caught-up ongoing shows remain visible.",
    label: "Hide completed shows only",
    name: "hideCompleted",
  },
  {
    description: "Dim TMDB search results for shows already in your library.",
    label: "Fade added search results",
    name: "fadeAdded",
  },
  {
    description: "Hide TMDB search results for shows already in your library.",
    label: "Hide added search results",
    name: "hideAdded",
  },
];

function isCompletedStatus(status: DisplayStatus) {
  return status === "completed";
}

export function shouldHideShowForPreferences(show: PreferenceAwareShow, preferences: UserPreferences) {
  if (preferences.hideDropped && show.displayStatus === "dropped") {
    return true;
  }

  return preferences.hideCompleted && isCompletedStatus(show.displayStatus);
}

export function shouldFadeShowForPreferences(show: PreferenceAwareShow, preferences: UserPreferences) {
  return preferences.fadeDropped && show.displayStatus === "dropped" && !preferences.hideDropped;
}

export function filterShowsForPreferences<TShow extends PreferenceAwareShow>(
  shows: TShow[],
  preferences: UserPreferences,
) {
  return shows.filter((show) => !shouldHideShowForPreferences(show, preferences));
}

export function shouldHideAddedForPreferences(isAdded: boolean, preferences: UserPreferences) {
  return isAdded && preferences.hideAdded;
}

export function shouldFadeAddedForPreferences(isAdded: boolean, preferences: UserPreferences) {
  return isAdded && preferences.fadeAdded && !preferences.hideAdded;
}

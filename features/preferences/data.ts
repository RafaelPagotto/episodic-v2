import type { SupabaseClient } from "@supabase/supabase-js";

import { isTrackingStatus } from "@/features/tracking";
import type { LibrarySort, SortDirection, TrackingStatus } from "@/features/tracking";
import type { Database } from "@/lib/supabase/types";

import { DEFAULT_USER_PREFERENCES } from "./defaults";
import type { UserPreferences } from "./types";

type EpisodicSupabaseClient = SupabaseClient<Database>;
type UserPreferencesInsert = Database["public"]["Tables"]["user_preferences"]["Insert"];
type UserPreferencesRow = Database["public"]["Tables"]["user_preferences"]["Row"];
type UserPreferencesUpdate = Database["public"]["Tables"]["user_preferences"]["Update"];

export class PreferencesDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PreferencesDataError";
  }
}

const LIBRARY_SORTS = ["title", "progress", "added", "status"] as const satisfies readonly LibrarySort[];
const SORT_DIRECTIONS = ["asc", "desc"] as const satisfies readonly SortDirection[];

function throwDataError(error: { message?: string } | null, fallbackMessage: string) {
  if (error) {
    throw new PreferencesDataError(fallbackMessage);
  }
}

function isLibrarySort(value: string): value is LibrarySort {
  return LIBRARY_SORTS.includes(value as LibrarySort);
}

function isSortDirection(value: string): value is SortDirection {
  return SORT_DIRECTIONS.includes(value as SortDirection);
}

function mapStatusOrder(value: string[]): TrackingStatus[] {
  const statuses = value.filter(isTrackingStatus);

  if (statuses.length === value.length && statuses.length > 0) {
    return statuses;
  }

  return DEFAULT_USER_PREFERENCES.libraryStatusOrder;
}

function mapPreferencesRow(row: UserPreferencesRow): UserPreferences {
  return {
    fadeAdded: row.search_fade_added,
    fadeDropped: row.fade_dropped,
    hideAdded: row.search_hide_added,
    hideCompleted: row.hide_completed,
    hideDropped: row.hide_dropped,
    librarySort: isLibrarySort(row.library_sort) ? row.library_sort : DEFAULT_USER_PREFERENCES.librarySort,
    librarySortDirection: isSortDirection(row.library_sort_direction)
      ? row.library_sort_direction
      : DEFAULT_USER_PREFERENCES.librarySortDirection,
    libraryStatusOrder: mapStatusOrder(row.library_status_order),
  };
}

function mapPreferencesToWrite(
  userId: string,
  preferences: UserPreferences,
): UserPreferencesInsert {
  return {
    fade_dropped: preferences.fadeDropped,
    hide_completed: preferences.hideCompleted,
    hide_dropped: preferences.hideDropped,
    library_sort: preferences.librarySort,
    library_sort_direction: preferences.librarySortDirection,
    library_status_order: preferences.libraryStatusOrder,
    search_fade_added: preferences.fadeAdded,
    search_hide_added: preferences.hideAdded,
    user_id: userId,
  };
}

function mapPreferencesToUpdate(preferences: UserPreferences): UserPreferencesUpdate {
  return {
    fade_dropped: preferences.fadeDropped,
    hide_completed: preferences.hideCompleted,
    hide_dropped: preferences.hideDropped,
    library_sort: preferences.librarySort,
    library_sort_direction: preferences.librarySortDirection,
    library_status_order: preferences.libraryStatusOrder,
    search_fade_added: preferences.fadeAdded,
    search_hide_added: preferences.hideAdded,
  };
}

async function createDefaultPreferences(supabase: EpisodicSupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from("user_preferences")
    .upsert(mapPreferencesToWrite(userId, DEFAULT_USER_PREFERENCES), { onConflict: "user_id" })
    .select("*")
    .limit(1);

  throwDataError(error, "Unable to create your preferences.");

  return data?.[0] ? mapPreferencesRow(data[0]) : DEFAULT_USER_PREFERENCES;
}

export async function getUserPreferences(supabase: EpisodicSupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from("user_preferences")
    .select("*")
    .eq("user_id", userId)
    .limit(1);

  throwDataError(error, "Unable to load your preferences.");

  if (!data?.[0]) {
    return createDefaultPreferences(supabase, userId);
  }

  return mapPreferencesRow(data[0]);
}

export async function updateUserPreferences(
  supabase: EpisodicSupabaseClient,
  userId: string,
  preferences: UserPreferences,
) {
  const { error } = await supabase
    .from("user_preferences")
    .upsert(
      {
        ...mapPreferencesToUpdate(preferences),
        user_id: userId,
      },
      { onConflict: "user_id" },
    );

  throwDataError(error, "Unable to save your preferences.");

  return preferences;
}

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createOptionalSupabaseServiceRoleClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/types";

import { CLEAR_WATCHED_HISTORY_RESET_STATUSES } from "./history";

type EpisodicSupabaseClient = SupabaseClient<Database>;
type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
type UserPreferencesRow = Database["public"]["Tables"]["user_preferences"]["Row"];
type UserShowRow = Database["public"]["Tables"]["user_shows"]["Row"];
type WatchedEpisodeRow = Database["public"]["Tables"]["watched_episodes"]["Row"];

export type UserDataExport = {
  exportedAt: string;
  profile: ProfileRow | null;
  user: {
    email: string | null;
    id: string;
  };
  userPreferences: UserPreferencesRow | null;
  userShows: UserShowRow[];
  watchedEpisodes: WatchedEpisodeRow[];
};

export class ProfileDataControlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProfileDataControlError";
  }
}

function throwDataError(error: { message?: string } | null, fallbackMessage: string) {
  if (error) {
    throw new ProfileDataControlError(fallbackMessage);
  }
}

export async function getUserDataExport(
  supabase: EpisodicSupabaseClient,
  user: { email?: string | null; id: string },
): Promise<UserDataExport> {
  const [
    { data: profiles, error: profileError },
    { data: preferences, error: preferencesError },
    { data: userShows, error: userShowsError },
    { data: watchedEpisodes, error: watchedEpisodesError },
  ] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).limit(1),
    supabase.from("user_preferences").select("*").eq("user_id", user.id).limit(1),
    supabase.from("user_shows").select("*").eq("user_id", user.id).order("added_at", { ascending: true }),
    supabase
      .from("watched_episodes")
      .select("*")
      .eq("user_id", user.id)
      .order("watched_at", { ascending: true }),
  ]);

  throwDataError(profileError, "Unable to export profile data.");
  throwDataError(preferencesError, "Unable to export preferences.");
  throwDataError(userShowsError, "Unable to export library data.");
  throwDataError(watchedEpisodesError, "Unable to export watched history.");

  return {
    exportedAt: new Date().toISOString(),
    profile: profiles?.[0] ?? null,
    user: {
      email: user.email ?? null,
      id: user.id,
    },
    userPreferences: preferences?.[0] ?? null,
    userShows: userShows ?? [],
    watchedEpisodes: watchedEpisodes ?? [],
  };
}

export async function clearUserWatchedHistory(supabase: EpisodicSupabaseClient, userId: string) {
  const { error } = await supabase.from("watched_episodes").delete().eq("user_id", userId);

  throwDataError(error, "Unable to clear watched history.");

  const { error: statusError } = await supabase
    .from("user_shows")
    .update({ status: "watchlist" })
    .eq("user_id", userId)
    .in("status", CLEAR_WATCHED_HISTORY_RESET_STATUSES);

  throwDataError(statusError, "Unable to update library statuses.");
}

export async function resetUserLibraryData(supabase: EpisodicSupabaseClient, userId: string) {
  const { error } = await supabase.from("user_shows").delete().eq("user_id", userId);

  throwDataError(error, "Unable to reset library data.");
}

export async function deleteAuthenticatedUserAccount(userId: string) {
  const serviceRoleClient = createOptionalSupabaseServiceRoleClient();

  if (!serviceRoleClient) {
    throw new ProfileDataControlError("Account deletion is not configured on the server.");
  }

  const { error } = await serviceRoleClient.auth.admin.deleteUser(userId);

  throwDataError(error, "Unable to delete your account.");
}

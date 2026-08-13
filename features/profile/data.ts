import type { SupabaseClient } from "@supabase/supabase-js";

import { DashboardDataError, getUserDashboardData } from "@/features/dashboard";
import { getUserPreferences, PreferencesDataError } from "@/features/preferences";
import { getDateOnlyForTimeZone, resolveTimeZone } from "@/lib/date-only";
import type { Database } from "@/lib/supabase/types";

import { getDeleteAccountConfirmationTarget } from "./confirmation";
import { getPersistedUserTimeZone } from "./timezone";
import type { ProfilePageData } from "./types";

type EpisodicSupabaseClient = SupabaseClient<Database>;

export class ProfileDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProfileDataError";
  }
}

export async function getUserProfileData(
  supabase: EpisodicSupabaseClient,
  userId: string,
  email: string | null | undefined,
): Promise<ProfilePageData> {
  try {
    const [preferences, persistedTimeZone] = await Promise.all([
      getUserPreferences(supabase, userId),
      getPersistedUserTimeZone(supabase, userId),
    ]);
    const timeZone = resolveTimeZone(persistedTimeZone);
    const dateOptions = {
      referenceDate: getDateOnlyForTimeZone(new Date(), timeZone),
      timeZone,
    };
    const dashboardData = await getUserDashboardData(supabase, userId, preferences, dateOptions);

    return {
      deleteConfirmationTarget: getDeleteAccountConfirmationTarget(email),
      email: email || "Unknown email",
      persistedTimeZone,
      preferences,
      summary: dashboardData.summary,
    };
  } catch (error) {
    if (error instanceof DashboardDataError || error instanceof PreferencesDataError) {
      throw new ProfileDataError(error.message);
    }

    throw new ProfileDataError("Unable to load your profile.");
  }
}

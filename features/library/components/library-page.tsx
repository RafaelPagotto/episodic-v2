import { PageHeader } from "@/components/page-header";
import { createOptionalSupabaseServerClient } from "@/lib/supabase/server";
import { getUserPreferences, PreferencesDataError } from "@/features/preferences";
import type { UserPreferences } from "@/features/preferences";
import { DEFAULT_USER_PREFERENCES } from "@/features/preferences/defaults";
import { getUserDateOptions } from "@/features/profile/timezone";
import { DEFAULT_TIME_ZONE } from "@/lib/date-only";

import { getUserLibraryShows, LibraryDataError } from "../data";
import type { LibraryShowCard } from "../types";
import { LibraryView } from "./library-view";

type LibraryPageState = {
  errorMessage: string;
  preferences: UserPreferences;
  shows: LibraryShowCard[];
  timeZone: string;
};

async function getLibraryPageState(): Promise<LibraryPageState> {
  const supabase = await createOptionalSupabaseServerClient();

  if (!supabase) {
    return {
      errorMessage: "Supabase is not configured yet.",
      preferences: DEFAULT_USER_PREFERENCES,
      shows: [],
      timeZone: DEFAULT_TIME_ZONE,
    };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      errorMessage: "Sign in to view your library.",
      preferences: DEFAULT_USER_PREFERENCES,
      shows: [],
      timeZone: DEFAULT_TIME_ZONE,
    };
  }

  try {
    const [preferences, dateOptions] = await Promise.all([
      getUserPreferences(supabase, user.id),
      getUserDateOptions(supabase, user.id),
    ]);
    const shows = await getUserLibraryShows(supabase, user.id, dateOptions);

    return {
      errorMessage: "",
      preferences,
      shows,
      timeZone: dateOptions.timeZone,
    };
  } catch (error) {
    return {
      errorMessage:
        error instanceof LibraryDataError || error instanceof PreferencesDataError
          ? error.message
          : "Unable to load your library.",
      preferences: DEFAULT_USER_PREFERENCES,
      shows: [],
      timeZone: DEFAULT_TIME_ZONE,
    };
  }
}

export async function LibraryPageContent() {
  const { errorMessage, preferences, shows, timeZone } = await getLibraryPageState();

  return (
    <section className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <PageHeader
        description="Your saved shows, progress, favourites, and watch status."
        title="Library"
      />
      <LibraryView initialShows={shows} loadError={errorMessage} preferences={preferences} timeZone={timeZone} />
    </section>
  );
}

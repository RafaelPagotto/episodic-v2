import { createOptionalSupabaseServerClient } from "@/lib/supabase/server";
import { getUserPreferences, PreferencesDataError } from "@/features/preferences";
import type { UserPreferences } from "@/features/preferences";
import { DEFAULT_USER_PREFERENCES } from "@/features/preferences/defaults";
import { getUserDateOptions } from "@/features/profile/timezone";

import { getUserLibraryShows, LibraryDataError } from "../data";
import type { LibraryShowCard } from "../types";
import { LibraryView } from "./library-view";

type LibraryPageState = {
  errorMessage: string;
  preferences: UserPreferences;
  shows: LibraryShowCard[];
};

async function getLibraryPageState(): Promise<LibraryPageState> {
  const supabase = await createOptionalSupabaseServerClient();

  if (!supabase) {
    return {
      errorMessage: "Supabase is not configured yet.",
      preferences: DEFAULT_USER_PREFERENCES,
      shows: [],
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
    };
  } catch (error) {
    return {
      errorMessage:
        error instanceof LibraryDataError || error instanceof PreferencesDataError
          ? error.message
          : "Unable to load your library.",
      preferences: DEFAULT_USER_PREFERENCES,
      shows: [],
    };
  }
}

export async function LibraryPageContent() {
  const { errorMessage, preferences, shows } = await getLibraryPageState();

  return (
    <section aria-label="Library" className="mx-auto w-full max-w-6xl">
      <LibraryView initialShows={shows} loadError={errorMessage} preferences={preferences} />
    </section>
  );
}

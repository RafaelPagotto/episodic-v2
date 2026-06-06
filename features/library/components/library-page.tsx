import { PageHeader } from "@/components/page-header";
import { createOptionalSupabaseServerClient } from "@/lib/supabase/server";
import { getUserPreferences, PreferencesDataError } from "@/features/preferences";
import type { UserPreferences } from "@/features/preferences";
import { DEFAULT_USER_PREFERENCES } from "@/features/preferences/defaults";

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
    const [shows, preferences] = await Promise.all([
      getUserLibraryShows(supabase, user.id),
      getUserPreferences(supabase, user.id),
    ]);

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
    <section className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <PageHeader
        description="Your saved shows, progress, favourites, and watch status."
        title="Library"
      />
      <LibraryView initialShows={shows} loadError={errorMessage} preferences={preferences} />
    </section>
  );
}

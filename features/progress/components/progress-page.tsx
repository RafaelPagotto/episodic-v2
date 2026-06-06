import { PageHeader } from "@/components/page-header";
import { Notice } from "@/components/ui/notice";
import { getUserLibraryShows, LibraryDataError } from "@/features/library/data";
import { DEFAULT_USER_PREFERENCES } from "@/features/preferences/defaults";
import { getUserPreferences, PreferencesDataError } from "@/features/preferences";
import type { UserPreferences } from "@/features/preferences/types";
import { createOptionalSupabaseServerClient } from "@/lib/supabase/server";

import { ProgressView } from "./progress-view";
import type { LibraryShowCard } from "@/features/library/types";

type ProgressPageState = {
  errorMessage: string;
  preferences: UserPreferences;
  shows: LibraryShowCard[];
};

async function getProgressPageState(): Promise<ProgressPageState> {
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
      errorMessage: "Sign in to view progress.",
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
          : "Unable to load progress.",
      preferences: DEFAULT_USER_PREFERENCES,
      shows: [],
    };
  }
}

export async function ProgressPageContent() {
  const { errorMessage, preferences, shows } = await getProgressPageState();

  return (
    <section className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <PageHeader description="Episode progress across your library." title="Progress" />

      {errorMessage ? (
        <Notice tone="error">{errorMessage}</Notice>
      ) : (
        <ProgressView preferences={preferences} shows={shows} />
      )}
    </section>
  );
}

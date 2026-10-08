import { createOptionalSupabaseServerClient } from "@/lib/supabase/server";
import { DEFAULT_USER_PREFERENCES } from "@/features/preferences/defaults";
import { getUserPreferences } from "@/features/preferences/data";
import type { UserPreferences } from "@/features/preferences/types";

import { getUserLibraryShowIds } from "../data";
import { ShowSearch } from "./show-search";
import { searchDemoCatalogue } from "@/features/guest/server";
import type { NormalizedTmdbSearchResult } from "@/lib/tmdb/types";

type SearchPageState = {
  initialAddedShowIds: number[];
  preferences: UserPreferences;
  demoMode?: boolean;
  demoResults?: NormalizedTmdbSearchResult[];
};

async function getSearchPageState(): Promise<SearchPageState> {
  const supabase = await createOptionalSupabaseServerClient();

  if (!supabase) {
    return {
      initialAddedShowIds: [],
      preferences: DEFAULT_USER_PREFERENCES,
    };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      initialAddedShowIds: [],
      preferences: DEFAULT_USER_PREFERENCES,
    };
  }

  try {
    const [initialAddedShowIds, preferences] = await Promise.all([
      getUserLibraryShowIds(supabase, user.id),
      getUserPreferences(supabase, user.id),
    ]);

    return {
      initialAddedShowIds,
      preferences,
      demoMode: Boolean(user.is_anonymous),
      demoResults: user.is_anonymous ? (await searchDemoCatalogue(supabase, "", 1)).results : undefined,
    };
  } catch {
    return {
      initialAddedShowIds: [],
      preferences: DEFAULT_USER_PREFERENCES,
    };
  }
}

export async function SearchPageContent() {
  const { initialAddedShowIds, preferences, demoMode, demoResults } = await getSearchPageState();

  return (
    <section aria-label="Search" className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <ShowSearch initialAddedShowIds={initialAddedShowIds} preferences={preferences} demoMode={demoMode} demoResults={demoResults} />
    </section>
  );
}

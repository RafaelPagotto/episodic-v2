import { PageHeader } from "@/components/page-header";
import { Notice } from "@/components/ui/notice";
import { getUserPreferences, PreferencesDataError } from "@/features/preferences";
import { getUserDateOptions } from "@/features/profile/timezone";
import { createOptionalSupabaseServerClient } from "@/lib/supabase/server";

import { DashboardDataError, getUserDashboardData } from "../data";
import type { DashboardData } from "../types";
import { DashboardView } from "./dashboard-view";

type DashboardPageState = {
  data: DashboardData | null;
  errorMessage: string;
};

async function getDashboardPageState(): Promise<DashboardPageState> {
  const supabase = await createOptionalSupabaseServerClient();

  if (!supabase) {
    return {
      data: null,
      errorMessage: "Supabase is not configured yet.",
    };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      data: null,
      errorMessage: "Sign in to view your dashboard.",
    };
  }

  try {
    const [preferences, dateOptions] = await Promise.all([
      getUserPreferences(supabase, user.id),
      getUserDateOptions(supabase, user.id),
    ]);

    return {
      data: await getUserDashboardData(supabase, user.id, preferences, dateOptions),
      errorMessage: "",
    };
  } catch (error) {
    return {
      data: null,
      errorMessage:
        error instanceof DashboardDataError || error instanceof PreferencesDataError
          ? error.message
          : "Unable to load your dashboard.",
    };
  }
}

export async function DashboardPageContent() {
  const { data, errorMessage } = await getDashboardPageState();

  return (
    <section className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <PageHeader
        description="A quick look at your library, progress, favourites, and next episodes."
        title="Dashboard"
      />

      {errorMessage || !data ? (
        <Notice tone="error">{errorMessage || "Unable to load your dashboard."}</Notice>
      ) : (
        <DashboardView data={data} />
      )}
    </section>
  );
}

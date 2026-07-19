import { PageHeader } from "@/components/page-header";
import { Notice } from "@/components/ui/notice";
import { createOptionalSupabaseServerClient } from "@/lib/supabase/server";
import { getUserDateOptions } from "@/features/profile/timezone";
import { DEFAULT_TIME_ZONE, getDateOnlyForTimeZone } from "@/lib/date-only";

import { getUserShowDetail, ShowDataError } from "../data";
import type { ShowDetail } from "../types";
import { ShowDetailView } from "./show-detail-view";

type ShowDetailPageContentProps = {
  seasonQueryParam?: string | null;
  tmdbId: number;
};

type ShowDetailPageState = {
  errorMessage: string;
  referenceDate: string;
  show: ShowDetail | null;
  timeZone: string;
};

async function getShowDetailPageState(tmdbId: number): Promise<ShowDetailPageState> {
  const supabase = await createOptionalSupabaseServerClient();

  if (!supabase) {
    return {
      errorMessage: "Supabase is not configured yet.",
      referenceDate: getDateOnlyForTimeZone(),
      show: null,
      timeZone: DEFAULT_TIME_ZONE,
    };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      errorMessage: "Sign in to view this show.",
      referenceDate: getDateOnlyForTimeZone(),
      show: null,
      timeZone: DEFAULT_TIME_ZONE,
    };
  }

  try {
    const dateOptions = await getUserDateOptions(supabase, user.id);
    const show = await getUserShowDetail(supabase, user.id, tmdbId, dateOptions);

    if (!show) {
      return {
        errorMessage: "This show is not in your library.",
        referenceDate: dateOptions.referenceDate,
        show: null,
        timeZone: dateOptions.timeZone,
      };
    }

    return {
      errorMessage: "",
      referenceDate: dateOptions.referenceDate,
      show,
      timeZone: dateOptions.timeZone,
    };
  } catch (error) {
    return {
      errorMessage: error instanceof ShowDataError ? error.message : "Unable to load this show.",
      referenceDate: getDateOnlyForTimeZone(),
      show: null,
      timeZone: DEFAULT_TIME_ZONE,
    };
  }
}

export async function ShowDetailPageContent({ seasonQueryParam = null, tmdbId }: ShowDetailPageContentProps) {
  const { errorMessage, referenceDate, show, timeZone } = await getShowDetailPageState(tmdbId);

  if (errorMessage || !show) {
    return (
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <PageHeader
          description="Episode tracking for shows in your library."
          title="Show details"
        />
        <Notice tone="error">{errorMessage || "Unable to load this show."}</Notice>
      </section>
    );
  }

  return (
    <ShowDetailView
      initialSeasonParam={seasonQueryParam}
      referenceDate={referenceDate}
      show={show}
      timeZone={timeZone}
    />
  );
}

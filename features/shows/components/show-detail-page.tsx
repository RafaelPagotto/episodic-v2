import { PageHeader } from "@/components/page-header";
import { Notice } from "@/components/ui/notice";
import { createOptionalSupabaseServerClient } from "@/lib/supabase/server";

import { getUserShowDetail, ShowDataError } from "../data";
import type { ShowDetail } from "../types";
import { ShowDetailView } from "./show-detail-view";

type ShowDetailPageContentProps = {
  tmdbId: number;
};

type ShowDetailPageState = {
  errorMessage: string;
  show: ShowDetail | null;
};

async function getShowDetailPageState(tmdbId: number): Promise<ShowDetailPageState> {
  const supabase = await createOptionalSupabaseServerClient();

  if (!supabase) {
    return {
      errorMessage: "Supabase is not configured yet.",
      show: null,
    };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      errorMessage: "Sign in to view this show.",
      show: null,
    };
  }

  try {
    const show = await getUserShowDetail(supabase, user.id, tmdbId);

    if (!show) {
      return {
        errorMessage: "This show is not in your library.",
        show: null,
      };
    }

    return {
      errorMessage: "",
      show,
    };
  } catch (error) {
    return {
      errorMessage: error instanceof ShowDataError ? error.message : "Unable to load this show.",
      show: null,
    };
  }
}

export async function ShowDetailPageContent({ tmdbId }: ShowDetailPageContentProps) {
  const { errorMessage, show } = await getShowDetailPageState(tmdbId);

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

  return <ShowDetailView show={show} />;
}

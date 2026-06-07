"use server";

import type { User } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";

import {
  isEpisodeNumber,
  isSeasonNumber,
  isShowTmdbId,
} from "../tracking/action-validation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isRecord } from "@/lib/validations/numbers";

import { DashboardDataError, markContinueWatchingNextEpisodeWatched } from "./data";

export type ContinueWatchingWatchedActionInput = {
  episodeNumber: number;
  seasonNumber: number;
  tmdbId: number;
};

export type ContinueWatchingWatchedActionResult = {
  message: string;
  status: "error" | "success";
};

type SupabaseServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;
type DashboardActionContext =
  | {
      error: ContinueWatchingWatchedActionResult;
    }
  | {
      supabase: SupabaseServerClient;
      user: User;
    };

function dashboardActionError(message: string): ContinueWatchingWatchedActionResult {
  return {
    message,
    status: "error",
  };
}

function isContinueWatchingWatchedActionInput(value: unknown): value is ContinueWatchingWatchedActionInput {
  return (
    isRecord(value)
    && isShowTmdbId(value.tmdbId)
    && isSeasonNumber(value.seasonNumber)
    && isEpisodeNumber(value.episodeNumber)
  );
}

async function getActionContext(): Promise<DashboardActionContext> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return {
      error: dashboardActionError("Sign in to update progress."),
    };
  }

  return {
    supabase,
    user,
  };
}

function revalidateDashboardTrackingPaths(tmdbId: number) {
  revalidatePath("/dashboard");
  revalidatePath(`/shows/${tmdbId}`);
  revalidatePath("/library");
  revalidatePath("/progress");
}

export async function markContinueWatchingEpisodeWatchedAction(
  input: ContinueWatchingWatchedActionInput,
): Promise<ContinueWatchingWatchedActionResult> {
  if (!isContinueWatchingWatchedActionInput(input)) {
    return dashboardActionError("Invalid request.");
  }

  try {
    const context = await getActionContext();

    if ("error" in context) {
      return context.error;
    }

    await markContinueWatchingNextEpisodeWatched(
      context.supabase,
      context.user.id,
      input.tmdbId,
      input.seasonNumber,
      input.episodeNumber,
    );
    revalidateDashboardTrackingPaths(input.tmdbId);

    return {
      message: `S${input.seasonNumber}E${input.episodeNumber} marked watched.`,
      status: "success",
    };
  } catch (error) {
    console.error("[Mark Continue Watching episode watched failed]", error);

    return dashboardActionError(
      error instanceof DashboardDataError ? error.message : "Unable to update this episode right now.",
    );
  }
}

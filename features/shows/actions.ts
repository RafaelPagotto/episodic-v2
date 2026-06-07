"use server";

import type { User } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";

import {
  isEpisodeWatchedActionInput,
  isSeasonWatchedActionInput,
  isShowTmdbId,
} from "@/features/tracking/action-validation";
import type {
  EpisodeWatchedActionInput,
  SeasonWatchedActionInput,
} from "@/features/tracking/action-validation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import {
  markShowWatched,
  resetShowProgress,
  setEpisodeWatched,
  setSeasonWatched,
} from "./data";
import type { ShowProgressActionResult } from "./types";

type SupabaseServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;
type ShowActionContext =
  | {
      error: ShowProgressActionResult;
    }
  | {
      supabase: SupabaseServerClient;
      user: User;
    };

function showActionError(message: string): ShowProgressActionResult {
  return {
    message,
    status: "error",
  };
}

async function getActionContext(): Promise<ShowActionContext> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return {
      error: showActionError("Sign in to update progress."),
    };
  }

  return {
    supabase,
    user,
  };
}

function revalidateShow(tmdbId: number) {
  revalidatePath("/dashboard");
  revalidatePath(`/shows/${tmdbId}`);
  revalidatePath("/library");
  revalidatePath("/progress");
}

export async function setEpisodeWatchedAction(
  input: EpisodeWatchedActionInput,
): Promise<ShowProgressActionResult> {
  if (!isEpisodeWatchedActionInput(input)) {
    return showActionError("Invalid request.");
  }

  const { episodeNumber, seasonNumber, tmdbId, watched } = input;

  try {
    const context = await getActionContext();

    if ("error" in context) {
      return context.error;
    }

    await setEpisodeWatched(context.supabase, context.user.id, tmdbId, seasonNumber, episodeNumber, watched);
    revalidateShow(tmdbId);

    return {
      message: watched ? "Episode marked watched." : "Episode marked unwatched.",
      status: "success",
    };
  } catch (error) {
    console.error("[Set episode watched failed]", error);

    return showActionError("Unable to update this episode right now.");
  }
}

export async function setSeasonWatchedAction(
  input: SeasonWatchedActionInput,
): Promise<ShowProgressActionResult> {
  if (!isSeasonWatchedActionInput(input)) {
    return showActionError("Invalid request.");
  }

  const { seasonNumber, tmdbId, watched } = input;

  try {
    const context = await getActionContext();

    if ("error" in context) {
      return context.error;
    }

    await setSeasonWatched(context.supabase, context.user.id, tmdbId, seasonNumber, watched);
    revalidateShow(tmdbId);

    return {
      message: watched ? "Season marked watched." : "Season marked unwatched.",
      status: "success",
    };
  } catch (error) {
    console.error("[Set season watched failed]", error);

    return showActionError("Unable to update this season right now.");
  }
}

export async function markShowWatchedAction(tmdbId: number): Promise<ShowProgressActionResult> {
  if (!isShowTmdbId(tmdbId)) {
    return showActionError("Invalid request.");
  }

  try {
    const context = await getActionContext();

    if ("error" in context) {
      return context.error;
    }

    await markShowWatched(context.supabase, context.user.id, tmdbId);
    revalidateShow(tmdbId);

    return {
      message: "Show marked watched.",
      status: "success",
    };
  } catch (error) {
    console.error("[Mark show watched failed]", error);

    return showActionError("Unable to mark this show watched right now.");
  }
}

export async function resetShowProgressAction(tmdbId: number): Promise<ShowProgressActionResult> {
  if (!isShowTmdbId(tmdbId)) {
    return showActionError("Invalid request.");
  }

  try {
    const context = await getActionContext();

    if ("error" in context) {
      return context.error;
    }

    await resetShowProgress(context.supabase, context.user.id, tmdbId);
    revalidateShow(tmdbId);

    return {
      message: "Show progress reset.",
      status: "success",
    };
  } catch (error) {
    console.error("[Reset show progress failed]", error);

    return showActionError("Unable to reset this show right now.");
  }
}

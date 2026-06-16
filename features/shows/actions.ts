"use server";

import type { User } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";

import {
  isEpisodeWatchedActionInput,
  isSeasonWatchedActionInput,
  isShowTmdbId,
} from "@/features/tracking/action-validation";
import { upsertTmdbShowMetadata } from "@/features/search/data";
import { createOptionalSupabaseServiceRoleClient } from "@/lib/supabase/admin";
import type {
  EpisodeWatchedActionInput,
  SeasonWatchedActionInput,
} from "@/features/tracking/action-validation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { consumeTmdbRateLimit } from "@/lib/tmdb/rate-limit";
import { getFullTmdbShowDetails } from "@/lib/tmdb/server";

import {
  getOwnedUserShow,
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

async function getActionContext(authErrorMessage = "Sign in to update progress."): Promise<ShowActionContext> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return {
      error: showActionError(authErrorMessage),
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

export async function refreshShowMetadataAction(tmdbId: number): Promise<ShowProgressActionResult> {
  if (!isShowTmdbId(tmdbId)) {
    return showActionError("Invalid request.");
  }

  try {
    const context = await getActionContext("Sign in to refresh metadata.");

    if ("error" in context) {
      return context.error;
    }

    const userShow = await getOwnedUserShow(context.supabase, context.user.id, tmdbId);

    if (!userShow) {
      return showActionError("This show is not in your library.");
    }

    const rateLimitResult = consumeTmdbRateLimit("refresh-show", context.user.id);

    if (!rateLimitResult.allowed) {
      return showActionError("Too many requests. Try again shortly.");
    }

    const metadataClient = createOptionalSupabaseServiceRoleClient();

    if (!metadataClient) {
      console.error("[Refresh show metadata failed] Shared metadata writes are not configured.");
      return showActionError("Unable to refresh metadata right now.");
    }

    const tmdbShow = await getFullTmdbShowDetails(tmdbId);

    await upsertTmdbShowMetadata({ metadataClient, tmdbShow });
    revalidateShow(tmdbId);

    return {
      message: `Refreshed metadata for ${tmdbShow.show.title}.`,
      status: "success",
    };
  } catch (error) {
    console.error("[Refresh show metadata failed]", error);

    return showActionError("Unable to refresh metadata right now.");
  }
}

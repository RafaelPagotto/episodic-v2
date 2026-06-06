"use server";

import { revalidatePath } from "next/cache";

import {
  isDropShowActionInput,
  isFavouriteActionInput,
  isShowTmdbId,
} from "@/features/tracking/action-validation";
import type {
  DropShowActionInput,
  FavouriteActionInput,
} from "@/features/tracking/action-validation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import {
  removeShowFromUserLibrary,
  updateUserShowFavourite,
  updateUserShowDropped,
} from "./data";
import type {
  RemoveShowActionResult,
  UpdateDroppedActionResult,
  UpdateFavouriteActionResult,
} from "./types";

function removeShowError(message: string, tmdbId?: number): RemoveShowActionResult {
  return {
    message,
    status: "error",
    tmdbId,
  };
}

function revalidateLibraryMutation(tmdbId: number) {
  revalidatePath("/dashboard");
  revalidatePath("/library");
  revalidatePath("/profile");
  revalidatePath("/progress");
  revalidatePath(`/shows/${tmdbId}`);
}

export async function removeShowFromLibraryAction(tmdbId: number): Promise<RemoveShowActionResult> {
  if (!isShowTmdbId(tmdbId)) {
    return removeShowError("Invalid request.");
  }

  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return removeShowError("Sign in to manage your library.", tmdbId);
    }

    await removeShowFromUserLibrary(supabase, user.id, tmdbId);

    revalidatePath("/library");
    revalidatePath("/search");

    return {
      message: "Show removed from your library.",
      status: "success",
      tmdbId,
    };
  } catch (error) {
    console.error("[Remove show from library failed]", error);

    return removeShowError("Unable to remove this show right now.", tmdbId);
  }
}

export async function updateShowFavouriteAction(
  input: FavouriteActionInput,
): Promise<UpdateFavouriteActionResult> {
  if (!isFavouriteActionInput(input)) {
    return removeShowError("Invalid request.");
  }

  const { favourite, tmdbId } = input;

  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return removeShowError("Sign in to manage your library.", tmdbId);
    }

    await updateUserShowFavourite(supabase, user.id, tmdbId, favourite);
    revalidateLibraryMutation(tmdbId);

    return {
      favourite,
      message: favourite ? "Added to favourites." : "Removed from favourites.",
      status: "success",
      tmdbId,
    };
  } catch (error) {
    console.error("[Update show favourite failed]", error);

    return removeShowError("Unable to update this favourite right now.", tmdbId);
  }
}

export async function updateShowDroppedAction(
  input: DropShowActionInput,
): Promise<UpdateDroppedActionResult> {
  if (!isDropShowActionInput(input)) {
    return removeShowError("Invalid request.");
  }

  const { dropped, tmdbId } = input;

  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return removeShowError("Sign in to manage your library.", tmdbId);
    }

    const trackingStatus = await updateUserShowDropped(supabase, user.id, tmdbId, dropped);
    revalidateLibraryMutation(tmdbId);

    return {
      dropped,
      message: dropped ? "Show dropped." : "Show resumed.",
      status: "success",
      tmdbId,
      trackingStatus,
    };
  } catch (error) {
    console.error("[Update show dropped state failed]", error);

    return removeShowError("Unable to update this show right now.", tmdbId);
  }
}

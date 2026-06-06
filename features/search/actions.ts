"use server";

import { revalidatePath } from "next/cache";

import { isShowTmdbId } from "@/features/tracking/action-validation";
import { createOptionalSupabaseServiceRoleClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { consumeTmdbRateLimit } from "@/lib/tmdb/rate-limit";
import { getFullTmdbShowDetails } from "@/lib/tmdb/server";

import { addTmdbShowToLibrary, getUserLibraryShowIds } from "./data";
import type { AddShowActionResult } from "./types";

function addShowError(message: string, tmdbId?: number): AddShowActionResult {
  return {
    message,
    status: "error",
    tmdbId,
  };
}

export async function addShowToLibraryAction(tmdbId: number): Promise<AddShowActionResult> {
  if (!isShowTmdbId(tmdbId)) {
    return addShowError("Invalid request.");
  }

  try {
    const userClient = await createSupabaseServerClient();
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      return addShowError("Sign in to add shows to your library.", tmdbId);
    }

    const rateLimitResult = consumeTmdbRateLimit("add-show", user.id);

    if (!rateLimitResult.allowed) {
      return addShowError("Too many requests. Try again shortly.", tmdbId);
    }

    const existingShowIds = await getUserLibraryShowIds(userClient, user.id);

    if (existingShowIds.includes(tmdbId)) {
      return {
        message: "This show is already in your library.",
        status: "duplicate",
        tmdbId,
      };
    }

    const metadataClient = createOptionalSupabaseServiceRoleClient();

    if (!metadataClient) {
      console.error("[Add show failed] Shared metadata writes are not configured.");
      return addShowError("Unable to add this show right now.", tmdbId);
    }

    const tmdbShow = await getFullTmdbShowDetails(tmdbId);
    const result = await addTmdbShowToLibrary({
      metadataClient,
      tmdbShow,
      userClient,
      userId: user.id,
    });

    revalidatePath("/search");
    revalidatePath("/library");

    if (result.status === "duplicate") {
      return {
        message: "This show is already in your library.",
        status: "duplicate",
        tmdbId,
      };
    }

    return {
      message: `Added ${result.title} to your library.`,
      status: "success",
      tmdbId,
    };
  } catch (error) {
    console.error("[Add show failed]", error);

    return addShowError("Unable to add this show right now.", tmdbId);
  }
}

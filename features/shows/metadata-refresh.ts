import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { upsertTmdbShowMetadata } from "../search/data";
import type { UpsertTmdbShowMetadataResult } from "../search/data";
import type { Database } from "../../lib/supabase/types";
import { getFullTmdbShowDetails } from "../../lib/tmdb/server";
import { validateTmdbId } from "../../lib/tmdb/validation";

export async function refreshTmdbShowMetadata(
  tmdbId: number,
  metadataClient: SupabaseClient<Database>,
): Promise<UpsertTmdbShowMetadataResult> {
  if (typeof tmdbId !== "number" || !validateTmdbId(tmdbId).ok) {
    throw new Error("Invalid TMDB show ID.");
  }

  const tmdbShow = await getFullTmdbShowDetails(tmdbId);

  return upsertTmdbShowMetadata({ metadataClient, tmdbShow });
}

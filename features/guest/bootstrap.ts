import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/supabase/types";
import { DEMO_SHOWS } from "./catalogue";

export async function registerCachedDemoCatalogue(client: SupabaseClient<Database>) {
  // Validate the whole cache before exposing any additional titles to guests.
  for (const show of DEMO_SHOWS) {
    const { data: cachedShow, error: showError } = await client.from("shows")
      .select("title").eq("tmdb_id", show.tmdbId).maybeSingle();
    if (showError || cachedShow?.title !== show.title) throw new Error("Demo show metadata is not ready.");
    const { data: episodes, error: episodeError } = await client.from("episodes")
      .select("id").eq("show_tmdb_id", show.tmdbId).gt("season_number", 0).limit(1);
    if (episodeError || !episodes?.length) throw new Error("Demo episodes are not ready.");
  }
  const { error } = await client.from("demo_catalogue").upsert(
    DEMO_SHOWS.map((show, display_order) => ({ show_tmdb_id: show.tmdbId, display_order })),
    { onConflict: "show_tmdb_id" },
  );
  if (error) throw new Error("Catalogue registration failed.");
}

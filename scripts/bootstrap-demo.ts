import { loadEnvConfig } from "@next/env";
import { createOptionalSupabaseServiceRoleClient } from "../lib/supabase/admin";
import { getFullTmdbShowDetails } from "../lib/tmdb/server";
import { upsertTmdbShowMetadata } from "../features/search/data";
import { DEMO_SHOWS } from "../features/guest/catalogue";
import { registerCachedDemoCatalogue } from "../features/guest/bootstrap";

let stage = "configuration";

async function main() {
  if (process.argv.includes("--check")) {
    if ([loadEnvConfig, createOptionalSupabaseServiceRoleClient, getFullTmdbShowDetails, upsertTmdbShowMetadata, registerCachedDemoCatalogue].some((fn) => typeof fn !== "function")) {
      throw new Error("Server imports unavailable");
    }
    console.info("[demo-bootstrap] Server imports ready. No environment loaded or requests made.");
    return;
  }
  if (!process.argv.includes("--confirm-shared-metadata-write")) {
    console.info("Usage: npm run demo:bootstrap -- --cached-only --confirm-shared-metadata-write");
    console.info(`Registers ${DEMO_SHOWS.length} cached demo titles without TMDB calls when --cached-only is supplied. Omit it to import metadata. No user data is copied or changed.`);
    return;
  }
  loadEnvConfig(process.cwd());
  const client = createOptionalSupabaseServiceRoleClient();
  if (!client) throw new Error("Bootstrap not configured");
  if (process.argv.includes("--cached-only")) {
    stage = "cached-catalogue-registration";
    await registerCachedDemoCatalogue(client);
    console.info("[demo-bootstrap] Cached catalogue ready. No TMDB requests or metadata writes.", { count: DEMO_SHOWS.length });
    return;
  }
  // Register nothing until every import completes; visitors must never see a partial catalogue.
  for (const show of DEMO_SHOWS) {
    stage = "fetch";
    const details = await getFullTmdbShowDetails(show.tmdbId);
    stage = "catalogue-preflight";
    if (details.show.title !== show.title || !details.episodes.some((episode) => episode.seasonNumber > 0)) {
      throw new Error("Demo catalogue preflight failed");
    }
    stage = "metadata-upsert";
    await upsertTmdbShowMetadata({ metadataClient: client, tmdbShow: details });
    console.info("[demo-bootstrap] Imported show.", { tmdbId: show.tmdbId });
  }
  stage = "catalogue-registration";
  const { error } = await client.from("demo_catalogue").upsert(DEMO_SHOWS.map((show, index) => ({ show_tmdb_id: show.tmdbId, display_order: index })), { onConflict: "show_tmdb_id" });
  if (error) throw new Error("Catalogue registration failed");
  console.info("[demo-bootstrap] Catalogue ready.", { count: DEMO_SHOWS.length });
}

main().catch(() => {
  console.error("[demo-bootstrap] Failed. Keep DEMO_ENABLED=false and verify configuration and imported metadata before retrying.", { stage });
  process.exitCode = 1;
});

import type { NextRequest } from "next/server";

import { getMetadataRefreshCandidates } from "@/features/shows/metadata-refresh-candidates";
import { beginScheduledMetadataRefresh } from "@/features/shows/metadata-refresh-retry";
import { refreshScheduledTmdbShowMetadata } from "@/features/shows/scheduled-metadata-refresh";
import { createOptionalSupabaseServiceRoleClient } from "@/lib/supabase/admin";
import { isTmdbClientError } from "@/lib/tmdb/errors";
import { createScheduledTmdbRequestControl } from "@/lib/tmdb/scheduled-requests";
import { getTmdbApiKey } from "@/lib/tmdb/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type RefreshResult = { tmdbId: number; status: "refreshed" | "failed" };

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function jsonError(message: string, status: number) {
  return json({ ok: false, error: { message } }, status);
}

export async function GET(request: NextRequest) {
  const startedAt = Date.now();
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return jsonError("Metadata refresh is not configured.", 503);
  }
  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return jsonError("Unauthorized.", 401);
  }

  const dryRunParam = request.nextUrl.searchParams.get("dryRun");
  if (dryRunParam !== null && dryRunParam !== "1") {
    return jsonError("Invalid dry-run parameter. Use dryRun=1 or omit it.", 400);
  }
  const dryRun = dryRunParam === "1";
  if (!dryRun && !getTmdbApiKey()) {
    return jsonError("Metadata refresh is not configured.", 503);
  }
  console.info("[metadata-refresh-cron] Started.", { dryRun });

  let metadataClient;
  let candidates;
  const control = createScheduledTmdbRequestControl(startedAt + 240_000);
  try {
    metadataClient = createOptionalSupabaseServiceRoleClient();
    if (!metadataClient) {
      console.error("[metadata-refresh-cron] Metadata client is not configured.");
      return jsonError("Metadata refresh is not configured.", 503);
    }
    candidates = await getMetadataRefreshCandidates(metadataClient, { control });
  } catch {
    console.error("[metadata-refresh-cron] Unable to prepare batch.");
    return jsonError("Unable to prepare metadata refresh.", 500);
  }

  console.info("[metadata-refresh-cron] Candidates selected.", { considered: candidates.length });
  if (dryRun) {
    return json({
      ok: true,
      dryRun: true,
      considered: candidates.length,
      candidates: candidates.map(({ tmdbId }) => ({ tmdbId })),
    });
  }

  const results: RefreshResult[] = [];
  for (const candidate of candidates) {
    let cancelReservation: Awaited<ReturnType<typeof beginScheduledMetadataRefresh>> | undefined;
    try {
      cancelReservation = await beginScheduledMetadataRefresh(candidate, metadataClient, control);
      await refreshScheduledTmdbShowMetadata(candidate.tmdbId, metadataClient, control);
      results.push({ tmdbId: candidate.tmdbId, status: "refreshed" });
      console.info("[metadata-refresh-cron] Show refreshed.", { tmdbId: candidate.tmdbId });
    } catch (error) {
      if (isTmdbClientError(error) && (error.code === "TMDB_NOT_CONFIGURED" || error.code === "TMDB_AUTH_ERROR")) {
        try {
          await cancelReservation?.();
        } catch {
          console.error("[metadata-refresh-cron] Unable to release metadata refresh attempt.", { tmdbId: candidate.tmdbId });
        }
        console.error("[metadata-refresh-cron] TMDB configuration rejected; batch stopped.");
        return jsonError("Metadata refresh is unavailable. Check TMDB configuration.", 503);
      }
      results.push({ tmdbId: candidate.tmdbId, status: "failed" });
      console.error("[metadata-refresh-cron] Show refresh failed.", { tmdbId: candidate.tmdbId });
    }
  }

  const refreshed = results.filter((result) => result.status === "refreshed").length;
  const summary = { considered: candidates.length, refreshed, failed: results.length - refreshed };
  console.info("[metadata-refresh-cron] Completed.", { ...summary, ...control.metrics(), elapsedMs: Date.now() - startedAt });

  // App pages load Supabase data dynamically; cron does not invalidate a user's client router cache.
  return json({ ok: true, ...summary, results });
}

import type { NextRequest } from "next/server";
import { createOptionalSupabaseServiceRoleClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: NextRequest) {
  const startedAt = Date.now();
  if (!process.env.CRON_SECRET) return json({ ok: false, error: "Guest cleanup is not configured." }, 503);
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return json({ ok: false, error: "Unauthorized." }, 401);
  const parameter = request.nextUrl.searchParams.get("dryRun");
  if (parameter !== null && parameter !== "1") return json({ ok: false, error: "Invalid dry-run parameter." }, 400);
  const dryRun = parameter === "1";
  try {
    const client = createOptionalSupabaseServiceRoleClient();
    if (!client) return json({ ok: false, error: "Guest cleanup is not configured." }, 503);
    const { data, error } = await client.rpc("cleanup_guest_accounts", { p_dry_run: dryRun });
    if (error || !data?.[0]) throw new Error("Cleanup failed");
    const { eligible, deleted, remaining } = data[0];
    console.info("[guest-cleanup-cron] Completed.", { dryRun, eligible, deleted, remaining, elapsedMs: Date.now() - startedAt });
    return json({ ok: true, dryRun, eligible, deleted, remaining });
  } catch {
    console.error("[guest-cleanup-cron] Failed.", { dryRun, elapsedMs: Date.now() - startedAt });
    return json({ ok: false, error: "Unable to clean up guest accounts." }, 500);
  }
}

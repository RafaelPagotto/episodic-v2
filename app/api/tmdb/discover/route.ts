import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/features/auth/session";
import { readDiscoverParams } from "@/features/discover/policy";
import { loadDiscoverListing } from "@/features/discover/server";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
export async function GET(request: NextRequest) {
  let user;
  try { user = await getCurrentUser(); } catch { user = null; }
  if (!user) return Response.json({ error: { code: "TMDB_UNAUTHORIZED", message: "Sign in to discover shows." } }, { status: 401, headers });
  const params = readDiscoverParams(request.nextUrl.searchParams);
  if (!params) return Response.json({ error: { code: "TMDB_INVALID_REQUEST", message: "Choose a valid collection and page." } }, { status: 400, headers });
  const result = await loadDiscoverListing(user, params.feed, params.page);
  if (result.error) return Response.json({ error: { code: `DISCOVER_${result.error.status}`, message: result.error.message } }, {
    status: result.error.status, headers: { ...headers, ...(result.error.retryAfter ? { "Retry-After": String(result.error.retryAfter) } : {}) },
  });
  return Response.json(result.data, { headers });
}

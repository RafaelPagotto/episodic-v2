import type { NextRequest } from "next/server";

import { getCurrentUser } from "@/features/auth/session";
import { consumeTmdbRateLimit } from "@/lib/tmdb/rate-limit";
import { getFullTmdbShowDetails } from "@/lib/tmdb/server";
import {
  jsonError,
  readLanguageParam,
  readTmdbIdParam,
  tmdbErrorResponse,
  tmdbRateLimitResponse,
} from "@/lib/tmdb/route-utils";

type TmdbShowDetailsRouteProps = {
  params: Promise<{
    tmdbId: string;
  }>;
};

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: TmdbShowDetailsRouteProps) {
  const user = await getCurrentUser();

  if (!user) {
    return jsonError(401, "TMDB_UNAUTHORIZED", "Sign in to load TMDB details.");
  }

  const rateLimitResult = consumeTmdbRateLimit("details", user.id);

  if (!rateLimitResult.allowed) {
    return tmdbRateLimitResponse(rateLimitResult);
  }

  const { tmdbId: rawTmdbId } = await params;
  const tmdbIdResult = readTmdbIdParam(rawTmdbId);

  if ("response" in tmdbIdResult) {
    return tmdbIdResult.response;
  }

  const languageResult = readLanguageParam(request.nextUrl.searchParams);

  if ("response" in languageResult) {
    return languageResult.response;
  }

  try {
    const response = await getFullTmdbShowDetails(tmdbIdResult.tmdbId, {
      language: languageResult.language,
    });

    return Response.json(response);
  } catch (error) {
    return tmdbErrorResponse(error);
  }
}

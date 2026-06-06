import type { NextRequest } from "next/server";

import { getCurrentUser } from "@/features/auth/session";
import { consumeTmdbRateLimit } from "@/lib/tmdb/rate-limit";
import { searchTmdbShows } from "@/lib/tmdb/server";
import {
  jsonError,
  readIncludeAdultParam,
  readLanguageParam,
  readPageParam,
  readSearchQueryParam,
  tmdbErrorResponse,
  tmdbRateLimitResponse,
} from "@/lib/tmdb/route-utils";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();

  if (!user) {
    return jsonError(401, "TMDB_UNAUTHORIZED", "Sign in to search TMDB.");
  }

  const rateLimitResult = consumeTmdbRateLimit("search", user.id);

  if (!rateLimitResult.allowed) {
    return tmdbRateLimitResponse(rateLimitResult);
  }

  const queryResult = readSearchQueryParam(request.nextUrl.searchParams);

  if ("response" in queryResult) {
    return queryResult.response;
  }

  const pageResult = readPageParam(request.nextUrl.searchParams);

  if ("response" in pageResult) {
    return pageResult.response;
  }

  const languageResult = readLanguageParam(request.nextUrl.searchParams);

  if ("response" in languageResult) {
    return languageResult.response;
  }

  try {
    const response = await searchTmdbShows({
      includeAdult: readIncludeAdultParam(request.nextUrl.searchParams),
      language: languageResult.language,
      page: pageResult.page,
      query: queryResult.query,
    });

    return Response.json(response);
  } catch (error) {
    return tmdbErrorResponse(error);
  }
}

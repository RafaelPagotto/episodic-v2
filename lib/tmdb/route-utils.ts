import "server-only";

import { NextResponse } from "next/server";

import { isTmdbClientError } from "./errors";
import type { TmdbRateLimitResult } from "./rate-limit";
import {
  TMDB_ID_MAX,
  TMDB_SEARCH_PAGE_MAX,
  TMDB_SEARCH_QUERY_MAX_LENGTH,
  validateTmdbId,
  validateTmdbLanguage,
  validateTmdbSearchPage,
  validateTmdbSearchQuery,
} from "./validation";

export function jsonError(status: number, code: string, message: string) {
  return NextResponse.json(
    {
      error: {
        code,
        message,
      },
    },
    { status },
  );
}

export function tmdbErrorResponse(error: unknown) {
  if (isTmdbClientError(error)) {
    console.error("[TMDB request failed]", {
      code: error.code,
      message: error.message,
      retryAfter: error.retryAfter,
      status: error.status,
      upstreamStatus: error.upstreamStatus,
    });

    if (error.code === "TMDB_NOT_FOUND") {
      return jsonError(404, "TMDB_NOT_FOUND", "The requested show was not found.");
    }

    if (error.code === "TMDB_RATE_LIMITED") {
      return jsonError(429, "TMDB_RATE_LIMITED", "TMDB is temporarily busy. Try again shortly.");
    }

    return jsonError(503, "TMDB_UNAVAILABLE", "TMDB is temporarily unavailable.");
  }

  console.error("[TMDB request failed]", error);

  return jsonError(500, "TMDB_UNKNOWN_ERROR", "Unable to complete the TMDB request.");
}

export function readLanguageParam(searchParams: URLSearchParams) {
  const result = validateTmdbLanguage(searchParams.get("language"));

  if (!result.ok) {
    return {
      response: jsonError(400, "TMDB_UNSUPPORTED_LANGUAGE", "Unsupported language."),
    };
  }

  return { language: result.value };
}

export function readIncludeAdultParam(searchParams: URLSearchParams) {
  const value = searchParams.get("includeAdult") ?? searchParams.get("include_adult");
  return value === "true" || value === "1";
}

export function readPageParam(searchParams: URLSearchParams) {
  const result = validateTmdbSearchPage(searchParams.get("page"));

  if (!result.ok) {
    return {
      response: jsonError(
        400,
        "TMDB_INVALID_PAGE",
        `Page must be an integer between 1 and ${TMDB_SEARCH_PAGE_MAX}.`,
      ),
    };
  }

  return { page: result.value };
}

export function readSearchQueryParam(searchParams: URLSearchParams) {
  const result = validateTmdbSearchQuery(searchParams.get("query"));

  if (!result.ok) {
    return {
      response: jsonError(
        400,
        result.error === "missing" ? "TMDB_MISSING_QUERY" : "TMDB_INVALID_QUERY",
        result.error === "missing"
          ? "Search query is required."
          : `Search query must be ${TMDB_SEARCH_QUERY_MAX_LENGTH} characters or fewer.`,
      ),
    };
  }

  return { query: result.value };
}

export function readTmdbIdParam(value: unknown) {
  const result = validateTmdbId(value);

  if (!result.ok) {
    return {
      response: jsonError(
        400,
        "TMDB_INVALID_SHOW_ID",
        `TMDB show id must be an integer between 1 and ${TMDB_ID_MAX}.`,
      ),
    };
  }

  return { tmdbId: result.value };
}

export function tmdbRateLimitResponse(result: TmdbRateLimitResult) {
  return NextResponse.json(
    {
      error: {
        code: "TMDB_RATE_LIMITED",
        message: "Too many requests. Try again shortly.",
      },
    },
    {
      headers: {
        "Retry-After": String(result.retryAfterSeconds),
      },
      status: 429,
    },
  );
}

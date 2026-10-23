import "server-only";

import { TmdbClientError } from "./errors";
import { DEFAULT_TMDB_LANGUAGE } from "./validation";
import type { TmdbRequestControl } from "./scheduled-requests";
import {
  normalizeFullShowDetails,
  normalizeSearchResponse,
} from "./normalize";
import type {
  NormalizedTmdbFullShow,
  NormalizedTmdbSearchResponse,
  TmdbSearchTvResponse,
  TmdbTvDetailsResponse,
  TmdbTvSeasonDetailsResponse,
  TmdbDiscoverFeed,
} from "./types";

const TMDB_API_BASE_URL = "https://api.themoviedb.org/3";
const SEASON_FETCH_BATCH_SIZE = 5;
let discoverCooldownUntil = 0;

type TmdbRequestParams = Record<string, boolean | number | string | null | undefined>;

export type SearchTmdbShowsOptions = {
  query: string;
  includeAdult?: boolean;
  language?: string;
  page?: number;
};

export type GetTmdbShowDetailsOptions = {
  language?: string;
  requestControl?: TmdbRequestControl;
};

export function getTmdbApiKey() {
  const apiKey = process.env.TMDB_API_KEY;

  if (!apiKey || apiKey === "your-tmdb-api-key") {
    return null;
  }

  return apiKey;
}

async function requestTmdb<TResponse>(path: string, params: TmdbRequestParams = {}, control?: TmdbRequestControl): Promise<TResponse> {
  if (control) {
    return control.run((signal) => requestTmdbOnce<TResponse>(path, params, signal));
  }
  return requestTmdbOnce<TResponse>(path, params);
}

async function requestTmdbOnce<TResponse>(path: string, params: TmdbRequestParams, signal?: AbortSignal) {
  const apiKey = getTmdbApiKey();

  if (!apiKey) {
    throw new TmdbClientError({
      code: "TMDB_NOT_CONFIGURED",
      message: "TMDB API key is not configured.",
      status: 503,
    });
  }

  const url = new URL(`${TMDB_API_BASE_URL}${path}`);
  url.searchParams.set("api_key", apiKey);

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  });

  let response: Response;

  try {
    response = await fetch(url, {
      signal,
      cache: "no-store",
      headers: {
        accept: "application/json",
      },
    });
  } catch {
    throw new TmdbClientError({
      code: "TMDB_NETWORK_ERROR",
      message: "Unable to reach TMDB.",
      status: 502,
    });
  }

  if (!response.ok) {
    throw createTmdbErrorFromResponse(response);
  }

  try {
    return (await response.json()) as TResponse;
  } catch {
    throw new TmdbClientError({
      code: "TMDB_UPSTREAM_ERROR",
      message: "TMDB returned an invalid JSON response.",
      status: 502,
    });
  }
}

function createTmdbErrorFromResponse(response: Response) {
  if (response.status === 401 || response.status === 403) {
    return new TmdbClientError({
      code: "TMDB_AUTH_ERROR",
      message: "TMDB rejected the configured API key.",
      status: 503,
      upstreamStatus: response.status,
    });
  }

  if (response.status === 404) {
    return new TmdbClientError({
      code: "TMDB_NOT_FOUND",
      message: "TMDB show was not found.",
      status: 404,
      upstreamStatus: response.status,
    });
  }

  if (response.status === 429) {
    return new TmdbClientError({
      code: "TMDB_RATE_LIMITED",
      message: "TMDB rate limit reached. Try again shortly.",
      retryAfter: response.headers.get("retry-after") ?? undefined,
      status: 429,
      upstreamStatus: response.status,
    });
  }

  return new TmdbClientError({
    code: "TMDB_UPSTREAM_ERROR",
    message: "TMDB returned an unexpected error.",
    status: 502,
    upstreamStatus: response.status,
  });
}

async function mapInBatches<TInput, TOutput>(
  items: TInput[],
  batchSize: number,
  mapper: (item: TInput) => Promise<TOutput>,
) {
  const results: TOutput[] = [];

  for (let index = 0; index < items.length; index += batchSize) {
    const batch = items.slice(index, index + batchSize);
    results.push(...(await Promise.all(batch.map(mapper))));
  }

  return results;
}

export async function getTmdbShowDetails(tmdbId: number, { language, requestControl }: GetTmdbShowDetailsOptions = {}) {
  return requestTmdb<TmdbTvDetailsResponse>(`/tv/${tmdbId}`, {
    append_to_response: "aggregate_credits,content_ratings",
    language: language || DEFAULT_TMDB_LANGUAGE,
  }, requestControl);
}

export async function getTmdbSeasonDetails(
  tmdbId: number,
  seasonNumber: number,
  { language, requestControl }: GetTmdbShowDetailsOptions = {},
) {
  return requestTmdb<TmdbTvSeasonDetailsResponse>(`/tv/${tmdbId}/season/${seasonNumber}`, {
    language: language || DEFAULT_TMDB_LANGUAGE,
  }, requestControl);
}

export async function searchTmdbShows({
  includeAdult = false,
  language = DEFAULT_TMDB_LANGUAGE,
  page = 1,
  query,
}: SearchTmdbShowsOptions): Promise<NormalizedTmdbSearchResponse> {
  const response = await requestTmdb<TmdbSearchTvResponse>("/search/tv", {
    include_adult: includeAdult,
    language,
    page,
    query,
  });

  return normalizeSearchResponse(response);
}

export async function discoverTmdbShows(feed: TmdbDiscoverFeed, page: number): Promise<NormalizedTmdbSearchResponse> {
  const paths = { trending: "/trending/tv/week", popular: "/tv/popular", "top-rated": "/tv/top_rated" };
  if (!Object.hasOwn(paths, feed) || !Number.isInteger(page) || page < 1 || page > 10) {
    throw new TmdbClientError({ code: "TMDB_UPSTREAM_ERROR", message: "Invalid listing request.", status: 503 });
  }
  if (Date.now() < discoverCooldownUntil) {
    throw new TmdbClientError({ code: "TMDB_RATE_LIMITED", message: "Try again shortly.", status: 429,
      retryAfter: String(Math.ceil((discoverCooldownUntil - Date.now()) / 1000)) });
  }
  discoverCooldownUntil = 0;
  let response: TmdbSearchTvResponse;
  try {
    response = await requestTmdbOnce<TmdbSearchTvResponse>(paths[feed], {
      language: DEFAULT_TMDB_LANGUAGE, page,
    }, AbortSignal.timeout(10_000));
  } catch (error) {
    if (!(error instanceof TmdbClientError) || error.code !== "TMDB_RATE_LIMITED") throw error;
    const header = error.retryAfter;
    const delay = header && /^\d+(\.\d+)?$/.test(header) ? Number(header) * 1000 :
      header ? Date.parse(header) - Date.now() : 1000;
    const retryMs = Math.max(1000, Number.isFinite(delay) ? delay : 1000);
    // Shared by discovery feeds in this process; never sleeps or retries a request.
    discoverCooldownUntil = Math.max(discoverCooldownUntil, Date.now() + retryMs);
    throw new TmdbClientError({ code: "TMDB_RATE_LIMITED", message: "Try again shortly.", status: 429,
      retryAfter: String(Math.ceil(retryMs / 1000)), upstreamStatus: 429 });
  }
  if (!response || response.page !== page || !Array.isArray(response.results) ||
      !Number.isInteger(response.total_pages) || (response.total_pages ?? -1) < 0 ||
      !Number.isInteger(response.total_results) || (response.total_results ?? -1) < 0) {
    throw new TmdbClientError({ code: "TMDB_UPSTREAM_ERROR", message: "Listing unavailable.", status: 503 });
  }
  const normalized = normalizeSearchResponse({ ...response, results: response.results.filter((item) => item && typeof item === "object" && item.adult !== true) });
  const seen = new Set<number>();
  normalized.results = normalized.results.filter((item) => {
    if (seen.has(item.tmdbId)) return false;
    seen.add(item.tmdbId);
    return true;
  }).slice(0, 20);
  return normalized;
}

export async function getFullTmdbShowDetails(
  tmdbId: number,
  options: GetTmdbShowDetailsOptions = {},
): Promise<NormalizedTmdbFullShow> {
  const showDetails = await getTmdbShowDetails(tmdbId, options);
  const seasons = Array.isArray(showDetails.seasons) ? showDetails.seasons : [];
  const seasonNumbers = seasons
    .map((season) => season.season_number)
    .filter(
      (seasonNumber): seasonNumber is number =>
        typeof seasonNumber === "number" && Number.isInteger(seasonNumber) && seasonNumber >= 0,
    );

  const seasonDetails = await mapInBatches(
    seasonNumbers,
    SEASON_FETCH_BATCH_SIZE,
    (seasonNumber) => getTmdbSeasonDetails(tmdbId, seasonNumber, options),
  );

  return normalizeFullShowDetails(showDetails, seasonDetails);
}

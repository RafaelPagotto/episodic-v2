import "server-only";

import { TmdbClientError } from "./errors";
import { DEFAULT_TMDB_LANGUAGE } from "./validation";
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
} from "./types";

const TMDB_API_BASE_URL = "https://api.themoviedb.org/3";
const SEASON_FETCH_BATCH_SIZE = 5;

type TmdbRequestParams = Record<string, boolean | number | string | null | undefined>;

export type SearchTmdbShowsOptions = {
  query: string;
  includeAdult?: boolean;
  language?: string;
  page?: number;
};

export type GetTmdbShowDetailsOptions = {
  language?: string;
};

export function getTmdbApiKey() {
  const apiKey = process.env.TMDB_API_KEY;

  if (!apiKey || apiKey === "your-tmdb-api-key") {
    return null;
  }

  return apiKey;
}

async function requestTmdb<TResponse>(path: string, params: TmdbRequestParams = {}) {
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

async function fetchTvShowDetails(tmdbId: number, { language }: GetTmdbShowDetailsOptions = {}) {
  return requestTmdb<TmdbTvDetailsResponse>(`/tv/${tmdbId}`, {
    language: language || DEFAULT_TMDB_LANGUAGE,
  });
}

async function fetchTvSeasonDetails(
  tmdbId: number,
  seasonNumber: number,
  { language }: GetTmdbShowDetailsOptions = {},
) {
  return requestTmdb<TmdbTvSeasonDetailsResponse>(`/tv/${tmdbId}/season/${seasonNumber}`, {
    language: language || DEFAULT_TMDB_LANGUAGE,
  });
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

export async function getFullTmdbShowDetails(
  tmdbId: number,
  options: GetTmdbShowDetailsOptions = {},
): Promise<NormalizedTmdbFullShow> {
  const showDetails = await fetchTvShowDetails(tmdbId, options);
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
    (seasonNumber) => fetchTvSeasonDetails(tmdbId, seasonNumber, options),
  );

  return normalizeFullShowDetails(showDetails, seasonDetails);
}

import { TMDB_ATTRIBUTION } from "./attribution";
import type {
  NormalizedTmdbEpisode,
  NormalizedTmdbFullShow,
  NormalizedTmdbGenre,
  NormalizedTmdbNetwork,
  NormalizedTmdbSearchResponse,
  NormalizedTmdbSearchResult,
  NormalizedTmdbSeason,
  NormalizedTmdbShow,
  TmdbGenreResponse,
  TmdbNamedResponse,
  TmdbSearchTvResponse,
  TmdbSearchTvResultResponse,
  TmdbTvDetailsResponse,
  TmdbTvEpisodeResponse,
  TmdbTvSeasonDetailsResponse,
  TmdbTvSeasonSummaryResponse,
} from "./types";

function arrayOrEmpty<TValue>(value: TValue[] | undefined) {
  return Array.isArray(value) ? value : [];
}

function nullableString(value: string | null | undefined) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function nullableNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function nullableInteger(value: number | null | undefined) {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function positiveInteger(value: number | null | undefined) {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

function stringArray(value: string[] | undefined) {
  return arrayOrEmpty(value).filter((item): item is string => typeof item === "string" && item.length > 0);
}

function normalizeGenre(genre: TmdbGenreResponse): NormalizedTmdbGenre | null {
  const id = positiveInteger(genre.id);
  const name = nullableString(genre.name);

  if (!id || !name) {
    return null;
  }

  return { id, name };
}

function normalizeNetwork(network: TmdbNamedResponse): NormalizedTmdbNetwork | null {
  const id = positiveInteger(network.id);
  const name = nullableString(network.name);

  if (!id || !name) {
    return null;
  }

  return {
    id,
    logoPath: nullableString(network.logo_path),
    name,
    originCountry: nullableString(network.origin_country),
  };
}

function normalizeSearchResult(result: TmdbSearchTvResultResponse): NormalizedTmdbSearchResult | null {
  const tmdbId = positiveInteger(result.id);
  const title = nullableString(result.name) ?? nullableString(result.original_name);

  if (!tmdbId || !title) {
    return null;
  }

  return {
    backdropPath: nullableString(result.backdrop_path),
    firstAirDate: nullableString(result.first_air_date),
    genreIds: arrayOrEmpty(result.genre_ids).filter(
      (genreId): genreId is number => Number.isInteger(genreId) && genreId > 0,
    ),
    originCountries: stringArray(result.origin_country),
    originalLanguage: nullableString(result.original_language),
    originalTitle: nullableString(result.original_name),
    overview: nullableString(result.overview),
    popularity: nullableNumber(result.popularity),
    posterPath: nullableString(result.poster_path),
    title,
    tmdbId,
    voteAverage: nullableNumber(result.vote_average),
    voteCount: nullableInteger(result.vote_count),
  };
}

export function normalizeSearchResponse(response: TmdbSearchTvResponse): NormalizedTmdbSearchResponse {
  return {
    attribution: TMDB_ATTRIBUTION,
    page: positiveInteger(response.page) ?? 1,
    results: arrayOrEmpty(response.results)
      .map(normalizeSearchResult)
      .filter((result): result is NormalizedTmdbSearchResult => Boolean(result)),
    totalPages: nullableInteger(response.total_pages) ?? 0,
    totalResults: nullableInteger(response.total_results) ?? 0,
  };
}

function normalizeShow(details: TmdbTvDetailsResponse): NormalizedTmdbShow {
  const tmdbId = positiveInteger(details.id) ?? 0;
  const title = nullableString(details.name) ?? nullableString(details.original_name) ?? "Untitled show";

  return {
    backdropPath: nullableString(details.backdrop_path),
    episodeRunTime: arrayOrEmpty(details.episode_run_time).filter(
      (runtime): runtime is number => Number.isInteger(runtime) && runtime > 0,
    ),
    firstAirDate: nullableString(details.first_air_date),
    genres: arrayOrEmpty(details.genres)
      .map(normalizeGenre)
      .filter((genre): genre is NormalizedTmdbGenre => Boolean(genre)),
    homepage: nullableString(details.homepage),
    inProduction: typeof details.in_production === "boolean" ? details.in_production : null,
    languages: stringArray(details.languages),
    lastAirDate: nullableString(details.last_air_date),
    networks: arrayOrEmpty(details.networks)
      .map(normalizeNetwork)
      .filter((network): network is NormalizedTmdbNetwork => Boolean(network)),
    numberOfEpisodes: nullableInteger(details.number_of_episodes),
    numberOfSeasons: nullableInteger(details.number_of_seasons),
    originCountries: stringArray(details.origin_country),
    originalLanguage: nullableString(details.original_language),
    originalTitle: nullableString(details.original_name),
    overview: nullableString(details.overview),
    popularity: nullableNumber(details.popularity),
    posterPath: nullableString(details.poster_path),
    status: nullableString(details.status),
    tagline: nullableString(details.tagline),
    title,
    tmdbId,
    type: nullableString(details.type),
    voteAverage: nullableNumber(details.vote_average),
    voteCount: nullableInteger(details.vote_count),
  };
}

function normalizeEpisode(
  episode: TmdbTvEpisodeResponse,
  showTmdbId: number,
  fallbackSeasonNumber: number,
): NormalizedTmdbEpisode | null {
  const episodeNumber = positiveInteger(episode.episode_number);

  if (!episodeNumber) {
    return null;
  }

  const seasonNumber = nullableInteger(episode.season_number) ?? fallbackSeasonNumber;

  return {
    airDate: nullableString(episode.air_date),
    episodeNumber,
    episodeType: nullableString(episode.episode_type),
    overview: nullableString(episode.overview),
    runtimeMinutes: nullableInteger(episode.runtime),
    seasonNumber,
    showTmdbId,
    stillPath: nullableString(episode.still_path),
    title: nullableString(episode.name) ?? `Episode ${episodeNumber}`,
    tmdbId: positiveInteger(episode.id),
    voteAverage: nullableNumber(episode.vote_average),
    voteCount: nullableInteger(episode.vote_count),
  };
}

function normalizeSeason(
  summary: TmdbTvSeasonSummaryResponse | undefined,
  details: TmdbTvSeasonDetailsResponse | undefined,
  showTmdbId: number,
  seasonNumber: number,
): NormalizedTmdbSeason {
  const episodes = arrayOrEmpty(details?.episodes)
    .map((episode) => normalizeEpisode(episode, showTmdbId, seasonNumber))
    .filter((episode): episode is NormalizedTmdbEpisode => Boolean(episode));

  return {
    airDate: nullableString(details?.air_date) ?? nullableString(summary?.air_date),
    episodeCount: episodes.length || nullableInteger(summary?.episode_count) || 0,
    episodes,
    name: nullableString(details?.name) ?? nullableString(summary?.name) ?? `Season ${seasonNumber}`,
    overview: nullableString(details?.overview) ?? nullableString(summary?.overview),
    posterPath: nullableString(details?.poster_path) ?? nullableString(summary?.poster_path),
    seasonNumber,
    showTmdbId,
    tmdbId: positiveInteger(details?.id) ?? positiveInteger(summary?.id),
    voteAverage: nullableNumber(details?.vote_average) ?? nullableNumber(summary?.vote_average),
  };
}

export function normalizeFullShowDetails(
  details: TmdbTvDetailsResponse,
  seasonDetails: TmdbTvSeasonDetailsResponse[] = [],
): NormalizedTmdbFullShow {
  const show = normalizeShow(details);
  const summariesBySeason = new Map<number, TmdbTvSeasonSummaryResponse>();
  const detailsBySeason = new Map<number, TmdbTvSeasonDetailsResponse>();

  arrayOrEmpty(details.seasons).forEach((summary) => {
    const seasonNumber = nullableInteger(summary.season_number);
    if (seasonNumber !== null && seasonNumber >= 0) {
      summariesBySeason.set(seasonNumber, summary);
    }
  });

  seasonDetails.forEach((season) => {
    const seasonNumber = nullableInteger(season.season_number);
    if (seasonNumber !== null && seasonNumber >= 0) {
      detailsBySeason.set(seasonNumber, season);
    }
  });

  const seasonNumbers = Array.from(
    new Set([...summariesBySeason.keys(), ...detailsBySeason.keys()]),
  ).sort((left, right) => left - right);

  const seasons = seasonNumbers.map((seasonNumber) =>
    normalizeSeason(
      summariesBySeason.get(seasonNumber),
      detailsBySeason.get(seasonNumber),
      show.tmdbId,
      seasonNumber,
    ),
  );

  return {
    attribution: TMDB_ATTRIBUTION,
    episodes: seasons.flatMap((season) => season.episodes),
    seasons,
    show,
  };
}

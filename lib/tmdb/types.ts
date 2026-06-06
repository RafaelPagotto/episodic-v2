import type { TmdbAttribution } from "./attribution";

export type TmdbGenreResponse = {
  id?: number;
  name?: string;
};

export type TmdbNamedResponse = {
  id?: number;
  logo_path?: string | null;
  name?: string;
  origin_country?: string;
};

export type TmdbSearchTvResultResponse = {
  adult?: boolean;
  backdrop_path?: string | null;
  first_air_date?: string;
  genre_ids?: number[];
  id?: number;
  name?: string;
  origin_country?: string[];
  original_language?: string;
  original_name?: string;
  overview?: string;
  popularity?: number;
  poster_path?: string | null;
  vote_average?: number;
  vote_count?: number;
};

export type TmdbSearchTvResponse = {
  page?: number;
  results?: TmdbSearchTvResultResponse[];
  total_pages?: number;
  total_results?: number;
};

export type TmdbTvSeasonSummaryResponse = {
  air_date?: string | null;
  episode_count?: number;
  id?: number;
  name?: string;
  overview?: string;
  poster_path?: string | null;
  season_number?: number;
  vote_average?: number;
};

export type TmdbTvEpisodeResponse = {
  air_date?: string | null;
  episode_number?: number;
  episode_type?: string;
  id?: number;
  name?: string;
  overview?: string;
  runtime?: number | null;
  season_number?: number;
  show_id?: number;
  still_path?: string | null;
  vote_average?: number;
  vote_count?: number;
};

export type TmdbTvSeasonDetailsResponse = TmdbTvSeasonSummaryResponse & {
  _id?: string;
  episodes?: TmdbTvEpisodeResponse[];
};

export type TmdbTvDetailsResponse = {
  backdrop_path?: string | null;
  episode_run_time?: number[];
  first_air_date?: string;
  genres?: TmdbGenreResponse[];
  homepage?: string;
  id?: number;
  in_production?: boolean;
  languages?: string[];
  last_air_date?: string;
  name?: string;
  networks?: TmdbNamedResponse[];
  number_of_episodes?: number;
  number_of_seasons?: number;
  origin_country?: string[];
  original_language?: string;
  original_name?: string;
  overview?: string;
  popularity?: number;
  poster_path?: string | null;
  seasons?: TmdbTvSeasonSummaryResponse[];
  status?: string;
  tagline?: string;
  type?: string;
  vote_average?: number;
  vote_count?: number;
};

export type NormalizedTmdbGenre = {
  id: number;
  name: string;
};

export type NormalizedTmdbNetwork = {
  id: number;
  logoPath: string | null;
  name: string;
  originCountry: string | null;
};

export type NormalizedTmdbSearchResult = {
  backdropPath: string | null;
  firstAirDate: string | null;
  genreIds: number[];
  originCountries: string[];
  originalLanguage: string | null;
  originalTitle: string | null;
  overview: string | null;
  popularity: number | null;
  posterPath: string | null;
  title: string;
  tmdbId: number;
  voteAverage: number | null;
  voteCount: number | null;
};

export type NormalizedTmdbSearchResponse = {
  attribution: TmdbAttribution;
  page: number;
  results: NormalizedTmdbSearchResult[];
  totalPages: number;
  totalResults: number;
};

export type NormalizedTmdbEpisode = {
  airDate: string | null;
  episodeNumber: number;
  episodeType: string | null;
  overview: string | null;
  runtimeMinutes: number | null;
  seasonNumber: number;
  showTmdbId: number;
  stillPath: string | null;
  title: string;
  tmdbId: number | null;
  voteAverage: number | null;
  voteCount: number | null;
};

export type NormalizedTmdbSeason = {
  airDate: string | null;
  episodeCount: number;
  episodes: NormalizedTmdbEpisode[];
  name: string;
  overview: string | null;
  posterPath: string | null;
  seasonNumber: number;
  showTmdbId: number;
  tmdbId: number | null;
  voteAverage: number | null;
};

export type NormalizedTmdbShow = {
  backdropPath: string | null;
  episodeRunTime: number[];
  firstAirDate: string | null;
  genres: NormalizedTmdbGenre[];
  homepage: string | null;
  inProduction: boolean | null;
  languages: string[];
  lastAirDate: string | null;
  networks: NormalizedTmdbNetwork[];
  numberOfEpisodes: number | null;
  numberOfSeasons: number | null;
  originCountries: string[];
  originalLanguage: string | null;
  originalTitle: string | null;
  overview: string | null;
  popularity: number | null;
  posterPath: string | null;
  status: string | null;
  tagline: string | null;
  title: string;
  tmdbId: number;
  type: string | null;
  voteAverage: number | null;
  voteCount: number | null;
};

export type NormalizedTmdbFullShow = {
  attribution: TmdbAttribution;
  episodes: NormalizedTmdbEpisode[];
  seasons: NormalizedTmdbSeason[];
  show: NormalizedTmdbShow;
};

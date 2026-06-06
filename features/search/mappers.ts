import type { NormalizedTmdbEpisode, NormalizedTmdbFullShow, NormalizedTmdbSeason } from "@/lib/tmdb/types";
import type { Database } from "@/lib/supabase/types";

type EpisodeInsert = Database["public"]["Tables"]["episodes"]["Insert"];
type SeasonInsert = Database["public"]["Tables"]["seasons"]["Insert"];
type ShowInsert = Database["public"]["Tables"]["shows"]["Insert"];

export function mapTmdbShowToShowInsert(
  { show }: NormalizedTmdbFullShow,
  lastSyncedAt: string,
): ShowInsert {
  return {
    backdrop_path: show.backdropPath,
    first_air_date: show.firstAirDate,
    genres: show.genres.map((genre) => ({
      id: genre.id,
      name: genre.name,
    })),
    last_air_date: show.lastAirDate,
    last_synced_at: lastSyncedAt,
    metadata: {
      episodeRunTime: show.episodeRunTime,
      homepage: show.homepage,
      inProduction: show.inProduction,
      languages: show.languages,
      networks: show.networks.map((network) => ({
        id: network.id,
        logoPath: network.logoPath,
        name: network.name,
        originCountry: network.originCountry,
      })),
      numberOfEpisodes: show.numberOfEpisodes,
      numberOfSeasons: show.numberOfSeasons,
      originCountries: show.originCountries,
      tagline: show.tagline,
      type: show.type,
    },
    original_language: show.originalLanguage,
    original_title: show.originalTitle,
    overview: show.overview,
    popularity: show.popularity,
    poster_path: show.posterPath,
    title: show.title,
    tmdb_id: show.tmdbId,
    tmdb_status: show.status,
    vote_average: show.voteAverage,
    vote_count: show.voteCount,
  };
}

export function mapTmdbSeasonToSeasonInsert(
  season: NormalizedTmdbSeason,
  lastSyncedAt: string,
): SeasonInsert {
  return {
    air_date: season.airDate,
    episode_count: season.episodeCount,
    last_synced_at: lastSyncedAt,
    metadata: {
      voteAverage: season.voteAverage,
    },
    name: season.name,
    overview: season.overview,
    poster_path: season.posterPath,
    season_number: season.seasonNumber,
    show_tmdb_id: season.showTmdbId,
    tmdb_id: season.tmdbId,
  };
}

export function mapTmdbEpisodeToEpisodeInsert(
  episode: NormalizedTmdbEpisode,
  lastSyncedAt: string,
): EpisodeInsert {
  return {
    air_date: episode.airDate,
    episode_number: episode.episodeNumber,
    last_synced_at: lastSyncedAt,
    metadata: {
      episodeType: episode.episodeType,
      voteAverage: episode.voteAverage,
      voteCount: episode.voteCount,
    },
    overview: episode.overview,
    runtime_minutes: episode.runtimeMinutes,
    season_number: episode.seasonNumber,
    show_tmdb_id: episode.showTmdbId,
    still_path: episode.stillPath,
    title: episode.title,
    tmdb_id: episode.tmdbId,
  };
}

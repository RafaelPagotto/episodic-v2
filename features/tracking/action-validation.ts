import { validateTmdbId } from "../../lib/tmdb/validation";
import { isBoolean, isIntegerInRange, isRecord } from "../../lib/validations/numbers";

export type EpisodeWatchedActionInput = {
  episodeNumber: number;
  seasonNumber: number;
  tmdbId: number;
  watched: boolean;
};

export type FavouriteActionInput = {
  favourite: boolean;
  tmdbId: number;
};

export type SeasonWatchedActionInput = {
  seasonNumber: number;
  tmdbId: number;
  watched: boolean;
};

export type DropShowActionInput = {
  dropped: boolean;
  tmdbId: number;
};

export function isShowTmdbId(value: unknown): value is number {
  return typeof value === "number" && validateTmdbId(value).ok;
}

export function isSeasonNumber(value: unknown): value is number {
  return isIntegerInRange(value, 0);
}

export function isEpisodeNumber(value: unknown): value is number {
  return isIntegerInRange(value, 1);
}

export function isEpisodeWatchedActionInput(value: unknown): value is EpisodeWatchedActionInput {
  return (
    isRecord(value)
    && isShowTmdbId(value.tmdbId)
    && isSeasonNumber(value.seasonNumber)
    && isEpisodeNumber(value.episodeNumber)
    && isBoolean(value.watched)
  );
}

export function isSeasonWatchedActionInput(value: unknown): value is SeasonWatchedActionInput {
  return (
    isRecord(value)
    && isShowTmdbId(value.tmdbId)
    && isSeasonNumber(value.seasonNumber)
    && isBoolean(value.watched)
  );
}

export function isFavouriteActionInput(value: unknown): value is FavouriteActionInput {
  return (
    isRecord(value)
    && isShowTmdbId(value.tmdbId)
    && isBoolean(value.favourite)
  );
}

export function isDropShowActionInput(value: unknown): value is DropShowActionInput {
  return (
    isRecord(value)
    && isShowTmdbId(value.tmdbId)
    && isBoolean(value.dropped)
  );
}

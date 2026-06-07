import {
  isEpisodeTrackable,
  isMainSeriesEpisode,
  type DisplayStatus,
  type Episode,
} from "../tracking";

import type { ShowDetail, ShowDetailEpisode, ShowDetailSeason } from "./types";

export const SHOW_DETAIL_STATUS_LABELS: Record<DisplayStatus, string> = {
  caught_up: "Caught up",
  completed: "Completed",
  dropped: "Dropped",
  watching: "Watching",
  watchlist: "Watchlist",
};

export const SPECIALS_OPTIONAL_NOTE =
  "Specials are optional extras and do not affect main progress or status.";

type SeasonNavigationOptions = {
  referenceDate?: Date | string;
};

export type ShowDetailSeasonOption = {
  label: string;
  seasonNumber: number;
};

export function getShowDetailActionLabels(show: Pick<ShowDetail, "favourite" | "progress" | "title">) {
  const isDropped = show.progress.displayStatus === "dropped";

  return {
    droppedDescription:
      "Dropped overrides the displayed status, but your watched episode progress is preserved.",
    favouriteAriaLabel: show.favourite
      ? `Remove ${show.title} from favourites`
      : `Add ${show.title} to favourites`,
    favouriteButtonLabel: show.favourite ? "Unfavourite" : "Favourite",
    isDropped,
    statusLabel: SHOW_DETAIL_STATUS_LABELS[show.progress.displayStatus],
    toggleDroppedAriaLabel: isDropped ? `Resume ${show.title}` : `Drop ${show.title}`,
    toggleDroppedButtonLabel: isDropped ? "Resume" : "Drop",
  };
}

export function getSeasonLabel(season: Pick<ShowDetailSeason, "name" | "seasonNumber">) {
  return season.seasonNumber === 0 ? "Specials" : season.name;
}

export function getShowDetailSeasonNavigation(
  show: ShowDetail,
  requestedSeason: unknown,
  options: SeasonNavigationOptions = {},
) {
  const seasons = getSortedSeasons(show.seasons);
  const requestedSeasonNumber = parseSeasonQueryParam(requestedSeason);
  const requestedActiveSeason = seasons.find((season) => season.seasonNumber === requestedSeasonNumber);
  const activeSeason =
    requestedActiveSeason
    ?? getDefaultActiveSeason(show, seasons, options)
    ?? seasons[0]
    ?? null;
  const activeSeasonIndex = activeSeason
    ? seasons.findIndex((season) => season.seasonNumber === activeSeason.seasonNumber)
    : -1;

  return {
    activeSeason,
    activeSeasonNumber: activeSeason?.seasonNumber ?? null,
    nextSeasonNumber:
      activeSeasonIndex >= 0 && activeSeasonIndex < seasons.length - 1
        ? seasons[activeSeasonIndex + 1]?.seasonNumber ?? null
        : null,
    previousSeasonNumber:
      activeSeasonIndex > 0
        ? seasons[activeSeasonIndex - 1]?.seasonNumber ?? null
        : null,
    seasonOptions: seasons.map<ShowDetailSeasonOption>((season) => ({
      label: getSeasonLabel(season),
      seasonNumber: season.seasonNumber,
    })),
  };
}

export function getShowDetailSeasonUrl(pathname: string, search: string, seasonNumber: number) {
  const params = new URLSearchParams(search);
  params.set("season", String(seasonNumber));

  return `${pathname}?${params.toString()}`;
}

function parseSeasonQueryParam(value: unknown) {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }

  if (typeof value !== "string") {
    return null;
  }

  const trimmedValue = value.trim();

  if (!/^-?\d+$/.test(trimmedValue)) {
    return null;
  }

  return Number(trimmedValue);
}

function getSortedSeasons(seasons: ShowDetailSeason[]) {
  return [...seasons].sort((left, right) => left.seasonNumber - right.seasonNumber);
}

function getDefaultActiveSeason(
  show: ShowDetail,
  seasons: ShowDetailSeason[],
  options: SeasonNavigationOptions,
) {
  const mainSeasons = seasons.filter((season) => season.seasonNumber > 0);

  if (mainSeasons.length === 0) {
    return seasons.find((season) => season.seasonNumber === 0) ?? null;
  }

  const seasonOne = mainSeasons.find((season) => season.seasonNumber === 1) ?? mainSeasons[0] ?? null;
  const watchedMainEpisodes = getMainEpisodes(show, options).filter((episode) => episode.watched);

  if (watchedMainEpisodes.length === 0 && show.progress.watchedEpisodeCount === 0) {
    return seasonOne;
  }

  const nextEpisode = getNextReleasedUnwatchedMainEpisode(show, options);

  if (nextEpisode) {
    return findSeason(seasons, nextEpisode.seasonNumber);
  }

  if (show.progress.displayStatus === "caught_up" || show.progress.displayStatus === "completed") {
    const latestReleasedMainEpisode = getLatestEpisode(getMainEpisodes(show, options));

    return latestReleasedMainEpisode ? findSeason(seasons, latestReleasedMainEpisode.seasonNumber) : seasonOne;
  }

  if (watchedMainEpisodes.length > 0) {
    return findSeason(seasons, getLatestEpisode(watchedMainEpisodes).seasonNumber);
  }

  return seasonOne;
}

function findSeason(seasons: ShowDetailSeason[], seasonNumber: number) {
  return seasons.find((season) => season.seasonNumber === seasonNumber) ?? null;
}

function getMainEpisodes(show: ShowDetail, options: SeasonNavigationOptions) {
  return show.seasons
    .flatMap((season) => season.episodes)
    .filter((episode) => isMainSeriesEpisode(episode))
    .filter((episode) => isEpisodeTrackable(toTrackingEpisode(show.tmdbId, episode), options))
    .sort(compareEpisodes);
}

function getNextReleasedUnwatchedMainEpisode(show: ShowDetail, options: SeasonNavigationOptions) {
  return getMainEpisodes(show, options).find((episode) => !episode.watched) ?? null;
}

function getLatestEpisode(episodes: ShowDetailEpisode[]) {
  return [...episodes].sort((left, right) => compareEpisodes(right, left))[0] ?? null;
}

function compareEpisodes(left: ShowDetailEpisode, right: ShowDetailEpisode) {
  return left.seasonNumber - right.seasonNumber || left.episodeNumber - right.episodeNumber;
}

function toTrackingEpisode(showTmdbId: number, episode: ShowDetailEpisode): Episode {
  return {
    airDate: episode.airDate,
    episodeNumber: episode.episodeNumber,
    metadata: {},
    overview: episode.overview,
    runtimeMinutes: episode.runtimeMinutes,
    seasonNumber: episode.seasonNumber,
    showTmdbId,
    stillPath: episode.stillPath,
    title: episode.title,
    tmdbId: null,
  };
}

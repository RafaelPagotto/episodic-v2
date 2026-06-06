import type { DisplayStatus, TrackingStatus } from "@/features/tracking";

export type ShowProgress = {
  displayStatus: DisplayStatus;
  progressPercentage: number;
  status: TrackingStatus;
  totalEpisodeCount: number;
  watchedEpisodeCount: number;
};

export type ShowDetailEpisode = {
  airDate: string | null;
  episodeNumber: number;
  overview: string | null;
  runtimeMinutes: number | null;
  seasonNumber: number;
  stillPath: string | null;
  title: string;
  watched: boolean;
};

export type ShowDetailSeason = {
  airDate: string | null;
  episodeCount: number;
  episodes: ShowDetailEpisode[];
  name: string;
  overview: string | null;
  posterPath: string | null;
  progress: ShowProgress;
  seasonNumber: number;
};

export type ShowDetail = {
  backdropPath: string | null;
  firstAirDate: string | null;
  favourite: boolean;
  overview: string | null;
  posterPath: string | null;
  progress: ShowProgress;
  seasons: ShowDetailSeason[];
  title: string;
  tmdbId: number;
  tmdbStatus: string | null;
};

export type ShowProgressActionResult = {
  message: string;
  status: "error" | "success";
};

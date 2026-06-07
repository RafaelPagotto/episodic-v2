import type { DisplayStatus, Episode, TrackingStatus, WatchedEpisode } from "@/features/tracking";

export type DashboardShowRecord = {
  addedAt: string;
  episodes: Episode[];
  favourite: boolean;
  posterPath: string | null;
  title: string;
  tmdbId: number;
  tmdbStatus: string | null;
  trackingStatus: TrackingStatus;
  watchedEpisodes: WatchedEpisode[];
};

export type DashboardSummary = {
  caughtUpCount: number;
  completedCount: number;
  droppedCount: number;
  favouriteCount: number;
  totalShows: number;
  watchingCount: number;
  watchlistCount: number;
};

export type ContinueWatchingEpisode = {
  airDate: string | null;
  episodeNumber: number;
  seasonNumber: number;
  title: string;
};

export type ContinueWatchingItem = {
  displayStatus: DisplayStatus;
  isFaded: boolean;
  lastWatchedAt: string | null;
  nextEpisode: ContinueWatchingEpisode;
  posterPath: string | null;
  progressPercentage: number;
  title: string;
  tmdbId: number;
  totalEpisodeCount: number;
  watchedEpisodeCount: number;
};

export type UpcomingEpisodeItem = {
  airDate: string;
  detailHref: string;
  episodeNumber: number;
  episodeTitle: string;
  seasonNumber: number;
  showTitle: string;
  tmdbId: number;
};

export type StartWatchingItem = {
  detailHref: string;
  episodeNumber: number;
  episodeTitle: string;
  posterPath: string | null;
  seasonNumber: number;
  showTitle: string;
  tmdbId: number;
};

export type DashboardData = {
  continueWatching: ContinueWatchingItem[];
  hiddenContinueWatchingCount: number;
  startWatching: StartWatchingItem[];
  summary: DashboardSummary;
  upcomingEpisodes: UpcomingEpisodeItem[];
};

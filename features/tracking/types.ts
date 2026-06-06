export const TRACKING_STATUSES = ["watchlist", "watching", "watched", "dropped"] as const;

export type TrackingStatus = (typeof TRACKING_STATUSES)[number];

export const DISPLAY_STATUSES = ["watchlist", "watching", "caught_up", "completed", "dropped"] as const;

export type DisplayStatus = (typeof DISPLAY_STATUSES)[number];

export function isTrackingStatus(value: unknown): value is TrackingStatus {
  return typeof value === "string" && TRACKING_STATUSES.includes(value as TrackingStatus);
}

export type SortDirection = "asc" | "desc";

export type LibrarySort = "title" | "progress" | "added" | "status";

export type ShowGenre = {
  id: number;
  name: string;
};

export type Show = {
  tmdbId: number;
  title: string;
  originalTitle: string | null;
  overview: string | null;
  posterPath: string | null;
  backdropPath: string | null;
  firstAirDate: string | null;
  lastAirDate: string | null;
  tmdbStatus: string | null;
  originalLanguage: string | null;
  popularity: number | null;
  voteAverage: number | null;
  voteCount: number | null;
  genres: ShowGenre[];
  metadata: Record<string, unknown>;
};

export type Season = {
  showTmdbId: number;
  tmdbId: number | null;
  seasonNumber: number;
  name: string;
  overview: string | null;
  posterPath: string | null;
  airDate: string | null;
  episodeCount: number;
  metadata: Record<string, unknown>;
};

export type Episode = {
  showTmdbId: number;
  seasonNumber: number;
  episodeNumber: number;
  tmdbId: number | null;
  title: string;
  overview: string | null;
  airDate: string | null;
  runtimeMinutes: number | null;
  stillPath: string | null;
  metadata: Record<string, unknown>;
};

export type UserShow = {
  id: number;
  userId: string;
  showTmdbId: number;
  status: TrackingStatus;
  favourite: boolean;
  addedAt: string;
  statusUpdatedAt: string;
};

export type WatchedEpisode = {
  id: number;
  userId: string;
  showTmdbId: number;
  seasonNumber: number;
  episodeNumber: number;
  watchedAt: string;
};

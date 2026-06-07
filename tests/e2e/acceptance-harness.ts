import { DEFAULT_USER_PREFERENCES } from "../../features/preferences/defaults";
import type { UserPreferences } from "../../features/preferences/types";
import { getStatusAfterClearingWatchedHistory } from "../../features/profile/history";
import { createDashboardData } from "../../features/dashboard/view-model";
import type { DashboardShowRecord } from "../../features/dashboard/types";
import {
  calculateProgressPercentage,
  calculateTotalEpisodeCount,
  calculateWatchedEpisodeCount,
  deriveDisplayStatus,
  deriveTrackingStatusAfterProgressChange,
  getNextEpisodeToWatch,
  getReleasedEpisodes,
  getReleasedTrackableEpisodes,
} from "../../features/tracking";
import type {
  DisplayStatus,
  Episode,
  Season,
  Show,
  TrackingStatus,
  UserShow,
  WatchedEpisode,
} from "../../features/tracking";

type AcceptanceUser = {
  email: string;
  id: string;
  password: string;
};

type AcceptanceProfile = {
  displayName: string | null;
  id: string;
};

type AcceptanceSession = {
  token: string;
  userId: string;
};

type TmdbShowFixture = {
  episodes: Episode[];
  seasons: Season[];
  show: Show;
};

type AcceptanceExport = {
  exportedAt: string;
  profile: AcceptanceProfile | null;
  user: {
    email: string;
    id: string;
  };
  userPreferences: UserPreferences;
  userShows: UserShow[];
  watchedEpisodes: WatchedEpisode[];
};

type AcceptanceProgress = {
  nextEpisode: Episode | null;
  progressPercentage: number;
  status: DisplayStatus;
  storedStatus: TrackingStatus;
  totalEpisodeCount: number;
  watchedEpisodeCount: number;
};

function clonePreferences(preferences: UserPreferences): UserPreferences {
  return {
    ...preferences,
    libraryStatusOrder: [...preferences.libraryStatusOrder],
  };
}

function showFixture(tmdbId: number, title: string, firstAirDate: string, tmdbStatus = "Returning Series"): Show {
  return {
    backdropPath: `/${tmdbId}-backdrop.jpg`,
    firstAirDate,
    genres: [],
    lastAirDate: null,
    metadata: {},
    originalLanguage: "en",
    originalTitle: title,
    overview: `${title} overview`,
    popularity: 10,
    posterPath: `/${tmdbId}-poster.jpg`,
    title,
    tmdbId,
    tmdbStatus,
    voteAverage: 8,
    voteCount: 100,
  };
}

function seasonFixture(showTmdbId: number, seasonNumber: number, episodeCount: number): Season {
  const month = String(Math.max(1, Math.min(seasonNumber, 12))).padStart(2, "0");

  return {
    airDate: `2024-${month}-01`,
    episodeCount,
    metadata: {},
    name: seasonNumber === 0 ? "Specials" : `Season ${seasonNumber}`,
    overview: null,
    posterPath: null,
    seasonNumber,
    showTmdbId,
    tmdbId: showTmdbId * 100 + seasonNumber,
  };
}

function episodeFixture(
  showTmdbId: number,
  seasonNumber: number,
  episodeNumber: number,
  title: string,
): Episode {
  const month = String(Math.max(1, Math.min(seasonNumber, 12))).padStart(2, "0");

  return {
    airDate: `2024-${month}-${String(episodeNumber).padStart(2, "0")}`,
    episodeNumber,
    metadata: {},
    overview: null,
    runtimeMinutes: 42,
    seasonNumber,
    showTmdbId,
    stillPath: null,
    title,
    tmdbId: showTmdbId * 1000 + seasonNumber * 10 + episodeNumber,
  };
}

function createTmdbFixtures() {
  const arcane = showFixture(100, "Arcane", "2021-11-06");
  const expanse = showFixture(200, "The Expanse", "2015-12-14", "Ended");

  return new Map<number, TmdbShowFixture>([
    [
      arcane.tmdbId,
      {
        episodes: [
          episodeFixture(arcane.tmdbId, 0, 1, "Bridging the Rift"),
          episodeFixture(arcane.tmdbId, 1, 1, "Welcome to the Playground"),
          episodeFixture(arcane.tmdbId, 1, 2, "Some Mysteries Are Better Left Unsolved"),
          episodeFixture(arcane.tmdbId, 2, 1, "Heavy Is the Crown"),
          episodeFixture(arcane.tmdbId, 2, 2, "Watch It All Burn"),
        ],
        seasons: [
          seasonFixture(arcane.tmdbId, 0, 1),
          seasonFixture(arcane.tmdbId, 1, 2),
          seasonFixture(arcane.tmdbId, 2, 2),
        ],
        show: arcane,
      },
    ],
    [
      expanse.tmdbId,
      {
        episodes: [
          episodeFixture(expanse.tmdbId, 1, 1, "Dulcinea"),
          episodeFixture(expanse.tmdbId, 1, 2, "The Big Empty"),
        ],
        seasons: [seasonFixture(expanse.tmdbId, 1, 2)],
        show: expanse,
      },
    ],
  ]);
}

export class AcceptanceTestApp {
  private currentUserId: string | null = null;
  private episodes = new Map<number, Episode[]>();
  private profiles = new Map<string, AcceptanceProfile>();
  private seasons = new Map<number, Season[]>();
  private sessions = new Map<string, AcceptanceSession>();
  private shows = new Map<number, Show>();
  private userIdCounter = 1;
  private userPreferences = new Map<string, UserPreferences>();
  private users = new Map<string, AcceptanceUser>();
  private usersByEmail = new Map<string, string>();
  private userShowIdCounter = 1;
  private userShows = new Map<string, UserShow>();
  private watchedEpisodeIdCounter = 1;
  private watchedEpisodes = new Map<string, WatchedEpisode>();
  private timestampCounter = 0;

  constructor(private readonly tmdbFixtures = createTmdbFixtures()) {}

  signUp(email: string, password: string) {
    if (this.usersByEmail.has(email)) {
      throw new Error("Email is already registered.");
    }

    const user: AcceptanceUser = {
      email,
      id: `user-${this.userIdCounter++}`,
      password,
    };

    this.users.set(user.id, user);
    this.usersByEmail.set(email, user.id);
    this.profiles.set(user.id, {
      displayName: null,
      id: user.id,
    });
    this.userPreferences.set(user.id, clonePreferences(DEFAULT_USER_PREFERENCES));

    return this.createSession(user.id);
  }

  signIn(email: string, password: string) {
    const userId = this.usersByEmail.get(email);
    const user = userId ? this.users.get(userId) : null;

    if (!user || user.password !== password) {
      throw new Error("Invalid sign in credentials.");
    }

    return this.createSession(user.id);
  }

  signOut() {
    this.currentUserId = null;
  }

  restoreSession(token: string) {
    const session = this.sessions.get(token);

    if (!session) {
      throw new Error("Session not found.");
    }

    this.currentUserId = session.userId;
    return this.currentUser();
  }

  currentUser() {
    const user = this.currentUserId ? this.users.get(this.currentUserId) : null;

    if (!user) {
      throw new Error("Sign in required.");
    }

    return {
      email: user.email,
      id: user.id,
    };
  }

  searchTmdb(query: string) {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return [];
    }

    return Array.from(this.tmdbFixtures.values())
      .filter(({ show }) => show.title.toLowerCase().includes(normalizedQuery))
      .map(({ show }) => ({
        firstAirDate: show.firstAirDate,
        overview: show.overview,
        posterPath: show.posterPath,
        title: show.title,
        tmdbId: show.tmdbId,
      }));
  }

  addShowToLibrary(tmdbId: number) {
    const user = this.currentUser();
    const fixture = this.tmdbFixtures.get(tmdbId);

    if (!fixture) {
      throw new Error("TMDB show not found.");
    }

    const userShowKey = this.userShowKey(user.id, tmdbId);

    if (this.userShows.has(userShowKey)) {
      return {
        status: "duplicate" as const,
        tmdbId,
      };
    }

    this.shows.set(tmdbId, fixture.show);
    this.seasons.set(tmdbId, [...fixture.seasons]);
    this.episodes.set(tmdbId, [...fixture.episodes]);

    this.userShows.set(userShowKey, {
      addedAt: this.nextTimestamp(),
      favourite: false,
      id: this.userShowIdCounter++,
      showTmdbId: tmdbId,
      status: "watchlist",
      statusUpdatedAt: this.nextTimestamp(),
      userId: user.id,
    });

    return {
      status: "added" as const,
      tmdbId,
    };
  }

  removeShowFromLibrary(tmdbId: number) {
    const user = this.currentUser();

    this.userShows.delete(this.userShowKey(user.id, tmdbId));

    for (const watchedKey of this.watchedEpisodes.keys()) {
      if (watchedKey.startsWith(`${user.id}:${tmdbId}:`)) {
        this.watchedEpisodes.delete(watchedKey);
      }
    }
  }

  setFavourite(tmdbId: number, favourite: boolean) {
    const user = this.currentUser();
    const userShow = this.getOwnedUserShow(user.id, tmdbId);

    this.userShows.set(this.userShowKey(user.id, tmdbId), {
      ...userShow,
      favourite,
    });
  }

  dropShow(tmdbId: number) {
    const user = this.currentUser();
    const userShow = this.getOwnedUserShow(user.id, tmdbId);

    this.userShows.set(this.userShowKey(user.id, tmdbId), {
      ...userShow,
      status: "dropped",
      statusUpdatedAt: this.nextTimestamp(),
    });
  }

  resumeShow(tmdbId: number) {
    const user = this.currentUser();
    const userShow = this.getOwnedUserShow(user.id, tmdbId);
    const episodes = this.getEpisodes(tmdbId);
    const watchedEpisodes = this.getWatchedEpisodes(user.id, tmdbId);
    const totalEpisodeCount = calculateTotalEpisodeCount(episodes);
    const watchedEpisodeCount = calculateWatchedEpisodeCount(episodes, watchedEpisodes);
    const status = deriveTrackingStatusAfterProgressChange({
      totalEpisodeCount,
      trackingStatus: "watchlist",
      watchedEpisodeCount,
    });

    this.userShows.set(this.userShowKey(user.id, tmdbId), {
      ...userShow,
      status,
      statusUpdatedAt: this.nextTimestamp(),
    });
  }

  markEpisodeWatched(tmdbId: number, seasonNumber: number, episodeNumber: number, watched = true) {
    const user = this.currentUser();
    const userShow = this.getOwnedUserShow(user.id, tmdbId);
    const episode = this.getEpisode(tmdbId, seasonNumber, episodeNumber);

    this.setWatchedEpisode(user.id, episode, watched);
    this.updateStatusFromProgress(userShow);
  }

  markSeasonWatched(tmdbId: number, seasonNumber: number, watched = true) {
    const user = this.currentUser();
    const userShow = this.getOwnedUserShow(user.id, tmdbId);
    const seasonEpisodes = this.getEpisodes(tmdbId).filter(
      (episode) => episode.seasonNumber === seasonNumber,
    );

    if (seasonEpisodes.length === 0) {
      throw new Error("Season has no episodes.");
    }

    const episodesToUpdate = watched ? getReleasedEpisodes(seasonEpisodes) : seasonEpisodes;

    for (const episode of episodesToUpdate) {
      this.setWatchedEpisode(user.id, episode, watched);
    }

    this.updateStatusFromProgress(userShow);
  }

  markShowWatched(tmdbId: number) {
    const user = this.currentUser();
    const userShow = this.getOwnedUserShow(user.id, tmdbId);
    const showEpisodes = this.getEpisodes(tmdbId);

    if (showEpisodes.length === 0) {
      throw new Error("Show has no episodes.");
    }

    for (const episode of getReleasedTrackableEpisodes(showEpisodes)) {
      this.setWatchedEpisode(user.id, episode, true);
    }

    this.updateStatusFromProgress(userShow);
  }

  resetProgress(tmdbId: number) {
    const user = this.currentUser();
    const userShow = this.getOwnedUserShow(user.id, tmdbId);

    for (const watchedKey of this.watchedEpisodes.keys()) {
      if (watchedKey.startsWith(`${user.id}:${tmdbId}:`)) {
        this.watchedEpisodes.delete(watchedKey);
      }
    }

    this.updateStatusFromProgress(userShow);
  }

  clearWatchedHistory() {
    const user = this.currentUser();

    for (const watchedEpisode of this.watchedEpisodes.values()) {
      if (watchedEpisode.userId === user.id) {
        this.watchedEpisodes.delete(
          this.watchedEpisodeKey(
            watchedEpisode.userId,
            watchedEpisode.showTmdbId,
            watchedEpisode.seasonNumber,
            watchedEpisode.episodeNumber,
          ),
        );
      }
    }

    for (const userShow of this.userShows.values()) {
      if (userShow.userId !== user.id) {
        continue;
      }

      const nextStatus = getStatusAfterClearingWatchedHistory(userShow.status);

      if (nextStatus !== userShow.status) {
        this.userShows.set(this.userShowKey(user.id, userShow.showTmdbId), {
          ...userShow,
          status: nextStatus,
          statusUpdatedAt: this.nextTimestamp(),
        });
      }
    }
  }

  getProgress(tmdbId: number): AcceptanceProgress {
    const user = this.currentUser();
    const userShow = this.getOwnedUserShow(user.id, tmdbId);
    const episodes = this.getEpisodes(tmdbId);
    const watchedEpisodes = this.getWatchedEpisodes(user.id, tmdbId);
    const totalEpisodeCount = calculateTotalEpisodeCount(episodes);
    const watchedEpisodeCount = calculateWatchedEpisodeCount(episodes, watchedEpisodes);
    const show = this.shows.get(tmdbId);

    return {
      nextEpisode: getNextEpisodeToWatch(episodes, watchedEpisodes),
      progressPercentage: calculateProgressPercentage({ totalEpisodeCount, watchedEpisodeCount }),
      status: deriveDisplayStatus({
        tmdbStatus: show?.tmdbStatus ?? null,
        totalEpisodeCount,
        trackingStatus: userShow.status,
        watchedEpisodeCount,
      }),
      storedStatus: userShow.status,
      totalEpisodeCount,
      watchedEpisodeCount,
    };
  }

  getContinueWatching() {
    const user = this.currentUser();
    const records: DashboardShowRecord[] = Array.from(this.userShows.values())
      .filter((userShow) => userShow.userId === user.id)
      .map((userShow) => {
        const show = this.shows.get(userShow.showTmdbId);

        return {
          addedAt: userShow.addedAt,
          episodes: this.getEpisodes(userShow.showTmdbId),
          favourite: userShow.favourite,
          posterPath: show?.posterPath ?? null,
          title: show?.title ?? `Show ${userShow.showTmdbId}`,
          tmdbId: userShow.showTmdbId,
          tmdbStatus: show?.tmdbStatus ?? null,
          trackingStatus: userShow.status,
          watchedEpisodes: this.getWatchedEpisodes(user.id, userShow.showTmdbId),
        };
      });

    return createDashboardData(records, this.getPreferences()).continueWatching;
  }

  markContinueWatchingNextEpisodeWatched(tmdbId: number) {
    const item = this.getContinueWatching().find((continueItem) => continueItem.tmdbId === tmdbId);

    if (!item) {
      throw new Error("No Continue Watching item found.");
    }

    this.markEpisodeWatched(tmdbId, item.nextEpisode.seasonNumber, item.nextEpisode.episodeNumber);
  }

  updatePreferences(preferences: Partial<UserPreferences>) {
    const user = this.currentUser();
    const currentPreferences = this.getPreferences();
    const nextPreferences = {
      ...currentPreferences,
      ...preferences,
      libraryStatusOrder: preferences.libraryStatusOrder
        ? [...preferences.libraryStatusOrder]
        : [...currentPreferences.libraryStatusOrder],
    };

    this.userPreferences.set(user.id, nextPreferences);

    return clonePreferences(nextPreferences);
  }

  getPreferences() {
    const user = this.currentUser();
    return clonePreferences(this.userPreferences.get(user.id) ?? DEFAULT_USER_PREFERENCES);
  }

  getLibrary() {
    const user = this.currentUser();

    return Array.from(this.userShows.values()).filter((userShow) => userShow.userId === user.id);
  }

  exportUserData(): AcceptanceExport {
    const user = this.currentUser();

    return {
      exportedAt: this.nextTimestamp(),
      profile: this.profiles.get(user.id) ?? null,
      user,
      userPreferences: this.getPreferences(),
      userShows: this.getLibrary(),
      watchedEpisodes: Array.from(this.watchedEpisodes.values())
        .filter((episode) => episode.userId === user.id)
        .sort((left, right) => left.watchedAt.localeCompare(right.watchedAt)),
    };
  }

  private createSession(userId: string) {
    const session: AcceptanceSession = {
      token: `session-${this.sessions.size + 1}`,
      userId,
    };

    this.sessions.set(session.token, session);
    this.currentUserId = userId;

    return session;
  }

  private getEpisode(tmdbId: number, seasonNumber: number, episodeNumber: number) {
    const episode = this.getEpisodes(tmdbId).find(
      (currentEpisode) =>
        currentEpisode.seasonNumber === seasonNumber
        && currentEpisode.episodeNumber === episodeNumber,
    );

    if (!episode) {
      throw new Error("Episode not found.");
    }

    return episode;
  }

  private getEpisodes(tmdbId: number) {
    return this.episodes.get(tmdbId) ?? [];
  }

  private getOwnedUserShow(userId: string, tmdbId: number) {
    const userShow = this.userShows.get(this.userShowKey(userId, tmdbId));

    if (!userShow) {
      throw new Error("This show is not in your library.");
    }

    return userShow;
  }

  private getWatchedEpisodes(userId: string, tmdbId: number) {
    return Array.from(this.watchedEpisodes.values()).filter(
      (episode) => episode.userId === userId && episode.showTmdbId === tmdbId,
    );
  }

  private nextTimestamp() {
    const timestamp = new Date(Date.UTC(2026, 0, 1, 0, 0, this.timestampCounter));
    this.timestampCounter += 1;
    return timestamp.toISOString();
  }

  private setWatchedEpisode(userId: string, episode: Episode, watched: boolean) {
    const watchedKey = this.watchedEpisodeKey(
      userId,
      episode.showTmdbId,
      episode.seasonNumber,
      episode.episodeNumber,
    );

    if (watched) {
      this.watchedEpisodes.set(watchedKey, {
        episodeNumber: episode.episodeNumber,
        id: this.watchedEpisodeIdCounter++,
        seasonNumber: episode.seasonNumber,
        showTmdbId: episode.showTmdbId,
        userId,
        watchedAt: this.nextTimestamp(),
      });
      return;
    }

    this.watchedEpisodes.delete(watchedKey);
  }

  private updateStatusFromProgress(userShow: UserShow) {
    const episodes = this.getEpisodes(userShow.showTmdbId);
    const watchedEpisodes = this.getWatchedEpisodes(userShow.userId, userShow.showTmdbId);
    const totalEpisodeCount = calculateTotalEpisodeCount(episodes);
    const watchedEpisodeCount = calculateWatchedEpisodeCount(episodes, watchedEpisodes);
    const nextStatus = deriveTrackingStatusAfterProgressChange({
      totalEpisodeCount,
      trackingStatus: userShow.status,
      watchedEpisodeCount,
    });

    if (nextStatus !== userShow.status) {
      this.userShows.set(this.userShowKey(userShow.userId, userShow.showTmdbId), {
        ...userShow,
        status: nextStatus,
        statusUpdatedAt: this.nextTimestamp(),
      });
    }
  }

  private userShowKey(userId: string, tmdbId: number) {
    return `${userId}:${tmdbId}`;
  }

  private watchedEpisodeKey(
    userId: string,
    tmdbId: number,
    seasonNumber: number,
    episodeNumber: number,
  ) {
    return `${userId}:${tmdbId}:${seasonNumber}:${episodeNumber}`;
  }
}

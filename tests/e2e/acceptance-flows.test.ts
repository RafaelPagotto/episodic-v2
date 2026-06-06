import { describe, expect, it } from "vitest";

import { AcceptanceTestApp } from "./acceptance-harness";

describe("Episodic critical acceptance flows", () => {
  it("signs up, signs in, signs out, and restores a saved session", () => {
    const app = new AcceptanceTestApp();
    const signUpSession = app.signUp("viewer@example.com", "correct-password");

    expect(app.currentUser()).toEqual({
      email: "viewer@example.com",
      id: "user-1",
    });

    app.signOut();
    expect(() => app.currentUser()).toThrow("Sign in required.");

    expect(app.restoreSession(signUpSession.token)).toEqual({
      email: "viewer@example.com",
      id: "user-1",
    });

    app.signOut();
    expect(() => app.signIn("viewer@example.com", "wrong-password")).toThrow(
      "Invalid sign in credentials.",
    );

    const signInSession = app.signIn("viewer@example.com", "correct-password");
    expect(signInSession.userId).toBe("user-1");
  });

  it("searches TMDB fixtures, adds a show, prevents duplicates, and removes only the current user's show", () => {
    const app = new AcceptanceTestApp();
    const firstUserSession = app.signUp("first@example.com", "password-one");

    expect(app.searchTmdb("arc")).toEqual([
      expect.objectContaining({
        title: "Arcane",
        tmdbId: 100,
      }),
    ]);

    expect(app.addShowToLibrary(100)).toEqual({
      status: "added",
      tmdbId: 100,
    });
    expect(app.addShowToLibrary(100)).toEqual({
      status: "duplicate",
      tmdbId: 100,
    });

    app.markEpisodeWatched(100, 1, 1);
    expect(app.getLibrary()).toHaveLength(1);

    app.signUp("second@example.com", "password-two");
    app.addShowToLibrary(100);
    expect(app.getLibrary()).toHaveLength(1);

    app.restoreSession(firstUserSession.token);
    app.removeShowFromLibrary(100);
    expect(app.getLibrary()).toHaveLength(0);
    expect(() => app.getProgress(100)).toThrow("This show is not in your library.");

    app.signIn("second@example.com", "password-two");
    expect(app.getLibrary()).toEqual([
      expect.objectContaining({
        showTmdbId: 100,
        userId: "user-2",
      }),
    ]);
  });

  it("tracks episode, season, whole-show watched state, and reset progress", () => {
    const app = new AcceptanceTestApp();
    app.signUp("tracker@example.com", "progress-password");
    app.addShowToLibrary(100);

    expect(app.getProgress(100)).toEqual({
      nextEpisode: expect.objectContaining({
        episodeNumber: 1,
        seasonNumber: 1,
      }),
      progressPercentage: 0,
      storedStatus: "watchlist",
      status: "watchlist",
      totalEpisodeCount: 4,
      watchedEpisodeCount: 0,
    });

    app.markEpisodeWatched(100, 1, 1);
    expect(app.getProgress(100)).toEqual({
      nextEpisode: expect.objectContaining({
        episodeNumber: 2,
        seasonNumber: 1,
      }),
      progressPercentage: 25,
      storedStatus: "watching",
      status: "watching",
      totalEpisodeCount: 4,
      watchedEpisodeCount: 1,
    });

    app.markSeasonWatched(100, 1);
    expect(app.getProgress(100)).toEqual({
      nextEpisode: expect.objectContaining({
        episodeNumber: 1,
        seasonNumber: 2,
      }),
      progressPercentage: 50,
      storedStatus: "watching",
      status: "watching",
      totalEpisodeCount: 4,
      watchedEpisodeCount: 2,
    });

    app.markShowWatched(100);
    expect(app.getProgress(100)).toEqual({
      nextEpisode: null,
      progressPercentage: 100,
      storedStatus: "watched",
      status: "caught_up",
      totalEpisodeCount: 4,
      watchedEpisodeCount: 4,
    });

    app.addShowToLibrary(200);
    app.markShowWatched(200);
    expect(app.getProgress(200)).toEqual(
      expect.objectContaining({
        storedStatus: "watched",
        status: "completed",
      }),
    );

    app.resetProgress(100);
    expect(app.getProgress(100)).toEqual({
      nextEpisode: expect.objectContaining({
        episodeNumber: 1,
        seasonNumber: 1,
      }),
      progressPercentage: 0,
      storedStatus: "watchlist",
      status: "watchlist",
      totalEpisodeCount: 4,
      watchedEpisodeCount: 0,
    });
  });

  it("persists favourite and drop/resume without clearing progress", () => {
    const app = new AcceptanceTestApp();
    app.signUp("status@example.com", "status-password");
    app.addShowToLibrary(100);
    app.markEpisodeWatched(100, 1, 1);

    app.setFavourite(100, true);
    app.dropShow(100);
    app.markSeasonWatched(100, 1);

    expect(app.getLibrary()).toEqual([
      expect.objectContaining({
        favourite: true,
        status: "dropped",
      }),
    ]);
    expect(app.getProgress(100)).toEqual(
      expect.objectContaining({
        storedStatus: "dropped",
        status: "dropped",
        watchedEpisodeCount: 2,
      }),
    );

    app.resumeShow(100);

    expect(app.getProgress(100)).toEqual(
      expect.objectContaining({
        storedStatus: "watching",
        status: "watching",
        watchedEpisodeCount: 2,
      }),
    );
  });

  it("clears only the authenticated user's watched history and resets progress statuses", () => {
    const app = new AcceptanceTestApp();
    const firstUserSession = app.signUp("clear@example.com", "clear-password");

    app.addShowToLibrary(100);
    app.markEpisodeWatched(100, 1, 1);
    app.setFavourite(100, true);
    app.addShowToLibrary(200);
    app.markShowWatched(200);

    app.signUp("other-clear@example.com", "other-password");
    app.addShowToLibrary(100);
    app.markEpisodeWatched(100, 1, 1);
    app.dropShow(100);

    app.restoreSession(firstUserSession.token);
    app.clearWatchedHistory();

    expect(app.getLibrary()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          favourite: true,
          showTmdbId: 100,
          status: "watchlist",
        }),
        expect.objectContaining({
          showTmdbId: 200,
          status: "watchlist",
        }),
      ]),
    );
    expect(app.exportUserData().watchedEpisodes).toEqual([]);

    app.signIn("other-clear@example.com", "other-password");
    expect(app.getProgress(100)).toEqual(
      expect.objectContaining({
        storedStatus: "dropped",
        status: "dropped",
        watchedEpisodeCount: 1,
      }),
    );

    app.clearWatchedHistory();
    expect(app.getProgress(100)).toEqual(
      expect.objectContaining({
        storedStatus: "dropped",
        status: "dropped",
        watchedEpisodeCount: 0,
      }),
    );
  });

  it("persists user preferences across sign out and session restore", () => {
    const app = new AcceptanceTestApp();
    const session = app.signUp("prefs@example.com", "preference-password");

    app.updatePreferences({
      fadeAdded: false,
      hideAdded: true,
      hideCompleted: true,
      hideDropped: true,
    });
    app.signOut();
    app.restoreSession(session.token);

    expect(app.getPreferences()).toEqual(
      expect.objectContaining({
        fadeAdded: false,
        hideAdded: true,
        hideCompleted: true,
        hideDropped: true,
      }),
    );
  });

  it("exports only the authenticated user's profile, preferences, library, and watched progress", () => {
    const app = new AcceptanceTestApp();
    const firstUserSession = app.signUp("exporter@example.com", "export-password");
    app.addShowToLibrary(100);
    app.markEpisodeWatched(100, 1, 1);
    app.updatePreferences({
      hideCompleted: true,
    });

    app.signUp("other@example.com", "other-password");
    app.addShowToLibrary(200);
    app.markEpisodeWatched(200, 1, 1);

    app.restoreSession(firstUserSession.token);
    const exportedData = app.exportUserData();

    expect(exportedData.user).toEqual({
      email: "exporter@example.com",
      id: "user-1",
    });
    expect(exportedData.profile).toEqual({
      displayName: null,
      id: "user-1",
    });
    expect(exportedData.userPreferences).toEqual(
      expect.objectContaining({
        hideCompleted: true,
      }),
    );
    expect(exportedData.userShows).toEqual([
      expect.objectContaining({
        showTmdbId: 100,
        userId: "user-1",
      }),
    ]);
    expect(exportedData.watchedEpisodes).toEqual([
      expect.objectContaining({
        episodeNumber: 1,
        seasonNumber: 1,
        showTmdbId: 100,
        userId: "user-1",
      }),
    ]);
    expect(exportedData.userShows).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          userId: "user-2",
        }),
      ]),
    );
    expect(exportedData.watchedEpisodes).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          userId: "user-2",
        }),
      ]),
    );
  });
});

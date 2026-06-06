# Episodic v2 Tracking Status Model

Episodic v2 uses a derived tracking/status model. Episode progress is the source of truth for active tracking state, and the database status field is retained for compatibility.

## Source Of Truth

`watched_episodes` is the source of truth for episode progress.

Progress-derived state is calculated from:

- Show episodes from TMDB metadata.
- Watched episode rows owned by the authenticated user.
- Show lifecycle metadata such as TMDB status.
- Episode `air_date` values when available.

The UI must not treat generic stored show statuses as the source of truth for progress.

## Compatibility Field

`user_shows.status` remains in the database because the current schema enum already exists and is used by older data flows.

Only `user_shows.status = dropped` is treated as a manual status override.

Other stored values such as `watchlist`, `watching`, and `watched` are compatibility values. They may be synchronized conservatively after progress changes, but display logic must recompute the user-facing status from progress instead of trusting them.

`caught_up` and `completed` are computed display statuses only. They are not database enum values and must not be added to `user_shows.status` without a future migration decision.

## Display Statuses

The app displays these computed statuses:

- `watchlist`: the show is in the user's library, is not dropped, and has 0 watched released/trackable episodes.
- `watching`: the show is not dropped, has watched released/trackable episodes, and not all released/trackable episodes are watched.
- `caught_up`: the show is not dropped, all released/trackable episodes are watched, and the app cannot prove the show has ended.
- `completed`: the show is not dropped, all released/trackable episodes are watched, and lifecycle metadata shows the show is ended, canceled, cancelled, or finished.
- `dropped`: the user explicitly dropped the show. Dropped overrides all computed statuses.

If lifecycle metadata is unknown, prefer `caught_up` over `completed`.

## Trackable Episodes

Progress calculations prefer released episodes over all known episodes.

When episode `air_date` metadata is available, future unaired episodes are excluded from total progress and completion calculations. Future episodes should not prevent an ongoing show from becoming `caught_up`.

When `air_date` metadata is unavailable or invalid, the episode is treated as trackable as a fallback.

Season 0 and specials currently follow the same behavior as the existing episode list. Do not introduce special-season exclusions without a separate product decision.

## Manual Controls

Users should not manually set `watchlist`, `watching`, `watched`, `caught_up`, or `completed`.

Supported manual controls are:

- Drop a show.
- Resume a dropped show.
- Favourite or unfavourite a show.
- Mark episodes watched or unwatched.
- Mark a season watched or unwatched.
- Mark all released/trackable episodes watched.
- Reset progress.
- Remove the show from the library.

Favourite is independent of status and progress.

Dropping a show preserves watched progress and overrides computed status. Resuming a show clears the dropped override and recomputes display status from existing watched progress.

## Continue Watching

Continue Watching uses derived display status and only includes active in-progress shows.

Dropped shows are excluded by default, even if they have watched progress. A user must resume a dropped show before it can appear in Continue Watching again.

## Implementation References

- `features/tracking/progress.ts`: shared progress and display status helpers.
- `features/library/view-model.ts`: library filters and display labels.
- `features/dashboard/view-model.ts`: dashboard summary and Continue Watching derivation.
- `features/shows/data.ts`: show detail progress derivation and watched episode mutations.

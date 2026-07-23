"use client";

import { Check, CircleSlash, LayoutGrid, List, ListVideo, Loader2, Play, Star, Trash2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";

import {
  ACTION_FEEDBACK_AUTO_DISMISS_MS,
  ActionFeedback,
} from "@/components/ui/action-feedback";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";
import { ProgressBar } from "@/components/ui/progress-bar";
import type { UserPreferences } from "@/features/preferences/types";
import { filterShowsForPreferences, shouldFadeShowForPreferences } from "@/features/preferences/view-model";
import { getShowDetailHref } from "@/features/shows";
import { markShowWatchedAction } from "@/features/shows/actions";
import { getTmdbImageUrl } from "@/lib/tmdb/images";
import { cn } from "@/lib/utils";
import { formatTimestamp } from "../../../lib/date-time";

import {
  removeShowFromLibraryAction,
  updateShowDroppedAction,
  updateShowFavouriteAction,
} from "../actions";
import type {
  LibraryFilter,
  LibraryShowCard,
  LibrarySortDirection,
  LibrarySortOption,
  LibraryViewMode,
} from "../types";
import {
  DISPLAY_STATUS_LABELS,
  filterAndSortLibraryShows,
  getInitialLibrarySortDirection,
  getInitialLibrarySortOption,
  getInitialLibraryViewMode,
  LIBRARY_FILTERS,
  LIBRARY_SORT_DIRECTION_STORAGE_KEY,
  LIBRARY_SORT_CHOICES,
  LIBRARY_SORT_STORAGE_KEY,
  LIBRARY_VIEW_MODES,
  LIBRARY_VIEW_MODE_STORAGE_KEY,
  updateLibraryShowFavourite,
  updateLibraryShowDropped,
  updateLibraryShowWatched,
} from "../view-model";

type LibraryViewProps = {
  initialShows: LibraryShowCard[];
  loadError: string;
  preferences: UserPreferences;
  timeZone?: string;
};

type LibraryMessage = {
  message: string;
  status: "error" | "success";
};

function formatAddedDate(value: string, timeZone: string) {
  return formatTimestamp(value, "en", { timeZone }) ?? value;
}

function LibraryPosterLink({ show }: { show: LibraryShowCard }) {
  const href = getShowDetailHref(show.tmdbId);
  const posterUrl = getTmdbImageUrl(show.posterPath, "w185");
  const linkClassName =
    "block shrink-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  if (!posterUrl) {
    return (
      <Link aria-label={`View details for ${show.title}`} className={linkClassName} href={href}>
        <div className="flex aspect-[2/3] w-24 items-center justify-center rounded-md bg-secondary text-xl font-semibold text-muted-foreground">
          {show.title.charAt(0)}
        </div>
      </Link>
    );
  }

  return (
    <Link aria-label={`View details for ${show.title}`} className={linkClassName} href={href}>
      <Image
        alt={`${show.title} poster`}
        className="aspect-[2/3] w-24 rounded-md object-cover"
        height={278}
        sizes="96px"
        src={posterUrl}
        width={185}
      />
    </Link>
  );
}

function LibraryGridPosterLink({ show }: { show: LibraryShowCard }) {
  const href = getShowDetailHref(show.tmdbId);
  const posterUrl = getTmdbImageUrl(show.posterPath, "w342");
  const linkClassName =
    "group block overflow-hidden rounded-md bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  if (!posterUrl) {
    return (
      <Link aria-label={`View details for ${show.title}`} className={linkClassName} href={href}>
        <div className="flex aspect-[2/3] items-center justify-center text-3xl font-semibold text-muted-foreground transition group-hover:scale-[1.02]">
          {show.title.charAt(0)}
        </div>
      </Link>
    );
  }

  return (
    <Link aria-label={`View details for ${show.title}`} className={linkClassName} href={href}>
      <Image
        alt={`${show.title} poster`}
        className="aspect-[2/3] w-full object-cover transition group-hover:scale-[1.02]"
        height={513}
        sizes="(min-width: 1280px) 18vw, (min-width: 1024px) 22vw, (min-width: 768px) 30vw, 45vw"
        src={posterUrl}
        width={342}
      />
    </Link>
  );
}

function LibraryStatusBadge({ show }: { show: LibraryShowCard }) {
  return (
    <span className="rounded-full border px-2 py-1 text-xs text-muted-foreground">
      {DISPLAY_STATUS_LABELS[show.displayStatus]}
    </span>
  );
}

export function LibraryView({ initialShows, loadError, preferences, timeZone = "UTC" }: LibraryViewProps) {
  const [filter, setFilter] = useState<LibraryFilter>("all");
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<LibraryMessage | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [shows, setShows] = useState(initialShows);
  const [sort, setSort] = useState<LibrarySortOption>("added");
  const [sortDirection, setSortDirection] = useState<LibrarySortDirection>("desc");
  const [viewMode, setViewMode] = useState<LibraryViewMode>("grid");

  useEffect(() => {
    try {
      setViewMode(getInitialLibraryViewMode(window.localStorage.getItem(LIBRARY_VIEW_MODE_STORAGE_KEY)));
    } catch {
      setViewMode("grid");
    }

    try {
      const nextSort = getInitialLibrarySortOption(window.localStorage.getItem(LIBRARY_SORT_STORAGE_KEY));

      setSort(nextSort);
      setSortDirection(getInitialLibrarySortDirection(
        window.localStorage.getItem(LIBRARY_SORT_DIRECTION_STORAGE_KEY),
        nextSort,
      ));
    } catch {
      setSort("added");
      setSortDirection("desc");
    }
  }, []);

  const preferenceVisibleShows = useMemo(
    () => filterShowsForPreferences(shows, preferences),
    [preferences, shows],
  );
  const visibleShows = useMemo(
    () => filterAndSortLibraryShows(preferenceVisibleShows, filter, sort, sortDirection),
    [filter, preferenceVisibleShows, sort, sortDirection],
  );

  function runMutation<TResult extends LibraryMessage>(
    actionId: string,
    action: () => Promise<TResult>,
    onSuccess: (result: TResult) => void,
    fallbackMessage: string,
  ) {
    if (pendingAction) {
      return;
    }

    setMessage(null);
    setPendingAction(actionId);

    startTransition(() => {
      void (async () => {
        try {
          const result = await action();

          if (result.status === "success") {
            onSuccess(result);
          }

          setMessage(result);
        } catch {
          setMessage({
            message: fallbackMessage,
            status: "error",
          });
        } finally {
          setPendingAction(null);
        }
      })();
    });
  }

  function updateShow(tmdbId: number, updater: (show: LibraryShowCard) => LibraryShowCard) {
    setShows((currentShows) =>
      currentShows.map((show) => (show.tmdbId === tmdbId ? updater(show) : show)),
    );
  }

  function handleFavourite(show: LibraryShowCard) {
    const favourite = !show.favourite;

    runMutation(
      `favourite:${show.tmdbId}`,
      () => updateShowFavouriteAction({ favourite, tmdbId: show.tmdbId }),
      () => updateShow(show.tmdbId, (currentShow) => updateLibraryShowFavourite(currentShow, favourite)),
      "Unable to update this favourite right now.",
    );
  }

  function handleDropToggle(show: LibraryShowCard) {
    const dropped = show.status !== "dropped";

    if (dropped && !window.confirm(`Drop ${show.title}? Your watched progress will be preserved.`)) {
      return;
    }

    runMutation(
      `drop:${show.tmdbId}`,
      () => updateShowDroppedAction({ dropped, tmdbId: show.tmdbId }),
      (result) =>
        updateShow(show.tmdbId, (currentShow) =>
          updateLibraryShowDropped(currentShow, dropped, result.trackingStatus),
        ),
      "Unable to update this show right now.",
    );
  }

  function handleRemove(show: LibraryShowCard) {
    if (pendingAction) {
      return;
    }

    const confirmed = window.confirm(`Remove ${show.title} from your library?`);

    if (!confirmed) {
      return;
    }

    runMutation(
      `remove:${show.tmdbId}`,
      () => removeShowFromLibraryAction(show.tmdbId),
      () => setShows((currentShows) => currentShows.filter((currentShow) => currentShow.tmdbId !== show.tmdbId)),
      "Unable to remove this show right now.",
    );
  }

  function handleMarkWatched(show: LibraryShowCard) {
    const showComplete =
      show.totalEpisodeCount > 0
      && show.watchedEpisodeCount >= show.totalEpisodeCount;

    if (show.totalEpisodeCount === 0 || showComplete) {
      return;
    }

    runMutation(
      `watch:${show.tmdbId}`,
      () => markShowWatchedAction(show.tmdbId),
      () => updateShow(show.tmdbId, updateLibraryShowWatched),
      "Unable to mark this show watched right now.",
    );
  }

  function handleViewModeChange(nextViewMode: LibraryViewMode) {
    setViewMode(nextViewMode);
    try {
      window.localStorage.setItem(LIBRARY_VIEW_MODE_STORAGE_KEY, nextViewMode);
    } catch {
      // Local storage is a convenience preference; keep the in-session selection if persistence is blocked.
    }
  }

  function handleSortChoiceChange(nextSortChoiceValue: string) {
    const nextSortChoice = LIBRARY_SORT_CHOICES.find((option) => option.value === nextSortChoiceValue);

    if (!nextSortChoice) {
      return;
    }

    setSort(nextSortChoice.sort);
    setSortDirection(nextSortChoice.direction);
    try {
      window.localStorage.setItem(LIBRARY_SORT_STORAGE_KEY, nextSortChoice.sort);
      window.localStorage.setItem(LIBRARY_SORT_DIRECTION_STORAGE_KEY, nextSortChoice.direction);
    } catch {
      // Local storage is a convenience preference; keep the in-session selection if persistence is blocked.
    }
  }

  if (loadError) {
    return <Notice tone="error">{loadError}</Notice>;
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2" aria-label="Library filters">
          {LIBRARY_FILTERS.map((option) => (
            <Button
              aria-pressed={filter === option.value}
              key={option.value}
              onClick={() => setFilter(option.value)}
              type="button"
              variant={filter === option.value ? "default" : "outline"}
            >
              {option.label}
            </Button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            Sort
            <select
              className="h-9 rounded-md border bg-background px-3 py-1 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              onChange={(event) => handleSortChoiceChange(event.target.value)}
              value={`${sort}:${sortDirection}`}
            >
              {LIBRARY_SORT_CHOICES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <div aria-label="Library view mode" className="flex rounded-md border bg-background p-1" role="group">
            {LIBRARY_VIEW_MODES.map((option) => {
              const Icon = option.value === "grid" ? LayoutGrid : List;

              return (
                <Button
                  aria-pressed={viewMode === option.value}
                  className="h-8 gap-2 px-3"
                  key={option.value}
                  onClick={() => handleViewModeChange(option.value)}
                  size="sm"
                  type="button"
                  variant={viewMode === option.value ? "default" : "ghost"}
                >
                  <Icon className="size-4" />
                  {option.label}
                </Button>
              );
            })}
          </div>
        </div>
      </div>

      {message ? (
        <ActionFeedback
          autoDismissMs={message.status === "success" ? ACTION_FEEDBACK_AUTO_DISMISS_MS : undefined}
          dismissible
          feedbackKey={message}
          tone={message.status === "error" ? "error" : "success"}
        >
          {message.message}
        </ActionFeedback>
      ) : null}

      {shows.length === 0 ? (
        <EmptyState
          description="Search TMDB and add a show to start tracking episodes."
          title="Your library is empty"
        />
      ) : null}

      {shows.length > 0 && preferenceVisibleShows.length === 0 ? (
        <EmptyState
          description="Adjust your profile preferences to show hidden library items."
          title="No shows match your preferences"
        />
      ) : null}

      {preferenceVisibleShows.length > 0 && visibleShows.length === 0 ? (
        <EmptyState
          description="Try another status filter to see more of your library."
          title="No shows match this filter"
        />
      ) : null}

      {visibleShows.length > 0 && viewMode === "grid" ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
          {visibleShows.map((show) => {
            const isUpdatingFavourite = pendingAction === `favourite:${show.tmdbId}`;
            const isMarkingWatched = pendingAction === `watch:${show.tmdbId}`;
            const isUpdatingStatus = pendingAction === `drop:${show.tmdbId}`;
            const isRemoving = pendingAction === `remove:${show.tmdbId}`;
            const detailHref = getShowDetailHref(show.tmdbId);
            const showComplete =
              show.totalEpisodeCount > 0
              && show.watchedEpisodeCount >= show.totalEpisodeCount;

            return (
              <Card
                key={show.tmdbId}
                className={cn("overflow-hidden", shouldFadeShowForPreferences(show, preferences) && "opacity-60")}
              >
                <CardContent className="flex h-full flex-col gap-3 p-3 sm:p-4">
                  <LibraryGridPosterLink show={show} />

                  <div className="flex min-h-0 flex-1 flex-col gap-3">
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-start justify-between gap-2">
                        <h2 className="min-w-0 text-sm font-semibold leading-tight sm:text-base">
                          <Link
                            aria-label={`View details for ${show.title}`}
                            className="line-clamp-2 rounded-sm underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            href={detailHref}
                          >
                            {show.title}
                          </Link>
                        </h2>
                        {show.favourite ? (
                          <Star
                            aria-label="Favourite"
                            className="mt-0.5 size-4 shrink-0 fill-primary text-primary"
                          />
                        ) : null}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <LibraryStatusBadge show={show} />
                      </div>
                    </div>

                    <ProgressBar
                      progressPercentage={show.progressPercentage}
                      totalEpisodeCount={show.totalEpisodeCount}
                      watchedEpisodeCount={show.watchedEpisodeCount}
                    />

                    <div className="mt-auto grid grid-cols-4 gap-2">
                      <Button
                        aria-label={`Mark all main episodes of ${show.title} watched`}
                        disabled={Boolean(pendingAction) || isPending || show.totalEpisodeCount === 0 || showComplete}
                        onClick={() => handleMarkWatched(show)}
                        size="icon"
                        title={showComplete ? "Main progress complete" : "Mark watched"}
                        type="button"
                        variant="default"
                      >
                        {isMarkingWatched ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                      </Button>

                      <Button
                        aria-label={
                          show.favourite
                            ? `Remove ${show.title} from favourites`
                            : `Add ${show.title} to favourites`
                        }
                        aria-pressed={show.favourite}
                        disabled={isPending}
                        onClick={() => handleFavourite(show)}
                        size="icon"
                        title={show.favourite ? "Remove from favourites" : "Add to favourites"}
                        type="button"
                        variant="outline"
                      >
                        {isUpdatingFavourite ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Star className={cn("size-4", show.favourite && "fill-primary text-primary")} />
                        )}
                      </Button>

                      <Button
                        aria-label={show.status === "dropped" ? `Resume ${show.title}` : `Drop ${show.title}`}
                        disabled={isPending}
                        onClick={() => handleDropToggle(show)}
                        size="icon"
                        title={show.status === "dropped" ? "Resume" : "Drop"}
                        type="button"
                        variant="outline"
                      >
                        {isUpdatingStatus ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : show.status === "dropped" ? (
                          <Play className="size-4" />
                        ) : (
                          <CircleSlash className="size-4" />
                        )}
                      </Button>

                      <Button
                        aria-label={`Remove ${show.title} from library`}
                        disabled={isPending}
                        onClick={() => handleRemove(show)}
                        size="icon"
                        title="Remove"
                        type="button"
                        variant="outline"
                      >
                        {isRemoving ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : null}

      {visibleShows.length > 0 && viewMode === "list" ? (
        <div className="grid gap-3">
          {visibleShows.map((show) => {
            const isUpdatingFavourite = pendingAction === `favourite:${show.tmdbId}`;
            const isUpdatingStatus = pendingAction === `drop:${show.tmdbId}`;
            const isRemoving = pendingAction === `remove:${show.tmdbId}`;
            const detailHref = getShowDetailHref(show.tmdbId);

            return (
              <Card
                key={show.tmdbId}
                className={cn("overflow-hidden", shouldFadeShowForPreferences(show, preferences) && "opacity-60")}
              >
                <CardContent className="flex gap-4 p-4 sm:p-5">
                  <LibraryPosterLink show={show} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-2">
                          <h2 className="min-w-0 text-base font-semibold">
                            <Link
                              aria-label={`View details for ${show.title}`}
                              className="block truncate rounded-sm underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              href={detailHref}
                            >
                              {show.title}
                            </Link>
                          </h2>
                          {show.favourite ? (
                            <Star
                              aria-label="Favourite"
                              className="size-4 shrink-0 fill-primary text-primary"
                            />
                          ) : null}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                          <LibraryStatusBadge show={show} />
                          <span className="rounded-full border px-2 py-1">
                            Added {formatAddedDate(show.addedAt, timeZone)}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <Button asChild className="gap-2" variant="outline">
                          <Link
                            aria-label={`View details and track episodes for ${show.title}`}
                            href={detailHref}
                          >
                            <ListVideo className="size-4" />
                            Details
                          </Link>
                        </Button>

                        <Button
                          aria-label={show.favourite ? `Remove ${show.title} from favourites` : `Add ${show.title} to favourites`}
                          aria-pressed={show.favourite}
                          disabled={isPending}
                          onClick={() => handleFavourite(show)}
                          size="icon"
                          title={show.favourite ? "Remove from favourites" : "Add to favourites"}
                          type="button"
                          variant="outline"
                        >
                          {isUpdatingFavourite ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <Star className={cn("size-4", show.favourite && "fill-primary text-primary")} />
                          )}
                        </Button>

                        <Button
                          className="gap-2"
                          disabled={isPending}
                          onClick={() => handleDropToggle(show)}
                          type="button"
                          variant="outline"
                        >
                          {isUpdatingStatus ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : show.status === "dropped" ? (
                            <Play className="size-4" />
                          ) : (
                            <CircleSlash className="size-4" />
                          )}
                          {show.status === "dropped" ? "Resume" : "Drop"}
                        </Button>

                        <Button
                          className="gap-2"
                          disabled={isPending}
                          onClick={() => handleRemove(show)}
                          type="button"
                          variant="outline"
                        >
                          {isRemoving ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                          Remove
                        </Button>
                      </div>
                    </div>

                    <div className="mt-5">
                      <ProgressBar
                        progressPercentage={show.progressPercentage}
                        totalEpisodeCount={show.totalEpisodeCount}
                        watchedEpisodeCount={show.watchedEpisodeCount}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

"use client";

import { CircleSlash, ListVideo, Loader2, Play, Star, Trash2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";
import { ProgressBar } from "@/components/ui/progress-bar";
import type { UserPreferences } from "@/features/preferences/types";
import { filterShowsForPreferences, shouldFadeShowForPreferences } from "@/features/preferences/view-model";
import { getShowDetailHref } from "@/features/shows";
import { getTmdbImageUrl } from "@/lib/tmdb/images";
import { cn } from "@/lib/utils";

import {
  removeShowFromLibraryAction,
  updateShowDroppedAction,
  updateShowFavouriteAction,
} from "../actions";
import type { LibraryFilter, LibraryShowCard, LibrarySortOption } from "../types";
import {
  DISPLAY_STATUS_LABELS,
  filterAndSortLibraryShows,
  LIBRARY_FILTERS,
  LIBRARY_SORT_OPTIONS,
  updateLibraryShowFavourite,
  updateLibraryShowDropped,
} from "../view-model";

type LibraryViewProps = {
  initialShows: LibraryShowCard[];
  loadError: string;
  preferences: UserPreferences;
};

type LibraryMessage = {
  message: string;
  status: "error" | "success";
};

function formatAddedDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
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

export function LibraryView({ initialShows, loadError, preferences }: LibraryViewProps) {
  const [filter, setFilter] = useState<LibraryFilter>("all");
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<LibraryMessage | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [shows, setShows] = useState(initialShows);
  const [sort, setSort] = useState<LibrarySortOption>("added");

  const preferenceVisibleShows = useMemo(
    () => filterShowsForPreferences(shows, preferences),
    [preferences, shows],
  );
  const visibleShows = useMemo(
    () => filterAndSortLibraryShows(preferenceVisibleShows, filter, sort),
    [filter, preferenceVisibleShows, sort],
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

        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          Sort
          <select
            className="h-9 rounded-md border bg-background px-3 py-1 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            onChange={(event) => setSort(event.target.value as LibrarySortOption)}
            value={sort}
          >
            {LIBRARY_SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {message ? (
        <Notice tone={message.status === "error" ? "error" : "success"}>{message.message}</Notice>
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

      {visibleShows.length > 0 ? (
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
                          <span className="rounded-full border px-2 py-1">
                            {DISPLAY_STATUS_LABELS[show.displayStatus]}
                          </span>
                          <span className="rounded-full border px-2 py-1">Added {formatAddedDate(show.addedAt)}</span>
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

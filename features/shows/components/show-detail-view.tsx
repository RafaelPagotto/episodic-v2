"use client";

import { Check, ChevronLeft, ChevronRight, CircleSlash, Loader2, Play, RotateCcw, Star } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";
import { ProgressBar } from "@/components/ui/progress-bar";
import { TmdbAttribution } from "@/components/tmdb-attribution";
import {
  updateShowDroppedAction,
  updateShowFavouriteAction,
} from "@/features/library/actions";
import { getTmdbImageUrl } from "@/lib/tmdb/images";
import { cn } from "@/lib/utils";

import {
  markShowWatchedAction,
  resetShowProgressAction,
  setEpisodeWatchedAction,
  setSeasonWatchedAction,
} from "../actions";
import {
  getSeasonLabel,
  getShowDetailActionLabels,
  getShowDetailSeasonNavigation,
  getShowDetailSeasonUrl,
  SPECIALS_OPTIONAL_NOTE,
} from "../view-model";
import type { ShowDetail, ShowDetailEpisode, ShowDetailSeason, ShowProgressActionResult } from "../types";

type ShowDetailViewProps = {
  initialSeasonParam?: string | null;
  show: ShowDetail;
};

type ActionMessage = {
  message: string;
  status: "error" | "success";
};

function formatDate(value: string | null) {
  if (!value) {
    return null;
  }

  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function getSeasonActionId(seasonNumber: number, watched: boolean) {
  return `season:${seasonNumber}:${watched ? "watch" : "unwatch"}`;
}

function getEpisodeActionId(episode: ShowDetailEpisode, watched: boolean) {
  return `episode:${episode.seasonNumber}:${episode.episodeNumber}:${watched ? "watch" : "unwatch"}`;
}

function ShowPoster({ show }: { show: ShowDetail }) {
  const posterUrl = getTmdbImageUrl(show.posterPath, "w342");

  if (!posterUrl) {
    return (
      <div className="flex aspect-[2/3] w-36 shrink-0 items-center justify-center rounded-md bg-secondary text-3xl font-semibold text-muted-foreground">
        {show.title.charAt(0)}
      </div>
    );
  }

  return (
    <Image
      alt={`${show.title} poster`}
      className="aspect-[2/3] w-36 shrink-0 rounded-md object-cover"
      height={513}
      priority
      sizes="144px"
      src={posterUrl}
      width={342}
    />
  );
}

function EpisodeRow({
  disabled,
  episode,
  onToggle,
  pendingAction,
}: {
  disabled: boolean;
  episode: ShowDetailEpisode;
  onToggle: (episode: ShowDetailEpisode, watched: boolean) => void;
  pendingAction: string | null;
}) {
  const nextWatched = !episode.watched;
  const actionId = getEpisodeActionId(episode, nextWatched);
  const isPending = pendingAction === actionId;
  const airDate = formatDate(episode.airDate);

  return (
    <div className="grid gap-3 border-t py-4 first:border-t-0 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
      <div className="min-w-0">
        <div className="flex items-start gap-3">
          <div
            className={cn(
              "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-medium",
              episode.watched && "border-primary bg-primary text-primary-foreground",
            )}
          >
            {episode.watched ? <Check className="size-4" /> : episode.episodeNumber}
          </div>
          <div className="min-w-0">
            <h3 className="font-medium">
              {episode.episodeNumber}. {episode.title}
            </h3>
            <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
              {airDate ? <span>{airDate}</span> : null}
              {episode.runtimeMinutes ? <span>{episode.runtimeMinutes} min</span> : null}
            </div>
            {episode.overview ? (
              <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{episode.overview}</p>
            ) : null}
          </div>
        </div>
      </div>
      <Button
        className="w-full gap-2 sm:w-auto md:w-36"
        disabled={disabled || isPending}
        onClick={() => onToggle(episode, nextWatched)}
        type="button"
        variant={episode.watched ? "outline" : "default"}
      >
        {isPending ? <Loader2 className="size-4 animate-spin" /> : null}
        {episode.watched ? "Unwatch" : "Mark watched"}
      </Button>
    </div>
  );
}

function SeasonPanel({
  disabled,
  onSeasonToggle,
  onToggleEpisode,
  pendingAction,
  season,
}: {
  disabled: boolean;
  onSeasonToggle: (season: ShowDetailSeason, watched: boolean) => void;
  onToggleEpisode: (episode: ShowDetailEpisode, watched: boolean) => void;
  pendingAction: string | null;
  season: ShowDetailSeason;
}) {
  const seasonComplete =
    season.progress.totalEpisodeCount > 0
    && season.progress.watchedEpisodeCount >= season.progress.totalEpisodeCount;
  const nextWatched = !seasonComplete;
  const actionId = getSeasonActionId(season.seasonNumber, nextWatched);
  const isPending = pendingAction === actionId;
  const airDate = formatDate(season.airDate);

  return (
    <Card>
      <CardHeader className="gap-4 md:flex-row md:items-start md:justify-between md:space-y-0">
        <div className="min-w-0">
          <CardTitle>
            {getSeasonLabel(season)}
            {airDate ? <span className="ml-2 text-sm font-normal text-muted-foreground">{airDate}</span> : null}
          </CardTitle>
          {season.overview ? <p className="mt-2 text-sm text-muted-foreground">{season.overview}</p> : null}
        </div>
        <Button
          className="w-full gap-2 sm:w-auto md:w-40"
          disabled={disabled || season.progress.totalEpisodeCount === 0 || isPending}
          onClick={() => onSeasonToggle(season, nextWatched)}
          type="button"
          variant={seasonComplete ? "outline" : "default"}
        >
          {isPending ? <Loader2 className="size-4 animate-spin" /> : null}
          {seasonComplete ? "Unwatch season" : "Watch season"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {season.seasonNumber === 0 ? (
          <Notice className="border-primary/30 bg-primary/10 text-foreground">
            {SPECIALS_OPTIONAL_NOTE}
          </Notice>
        ) : null}
        <ProgressBar
          label={season.seasonNumber === 0 ? "Specials watched" : undefined}
          progressPercentage={season.progress.progressPercentage}
          totalEpisodeCount={season.progress.totalEpisodeCount}
          watchedEpisodeCount={season.progress.watchedEpisodeCount}
        />
        {season.episodes.length === 0 ? (
          <EmptyState
            className="py-6"
            description="TMDB has not provided episode metadata for this season yet."
            title="No episodes available"
          />
        ) : (
          <div>
            {season.episodes.map((episode) => (
              <EpisodeRow
                key={`${episode.seasonNumber}-${episode.episodeNumber}`}
                disabled={disabled}
                episode={episode}
                onToggle={onToggleEpisode}
                pendingAction={pendingAction}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function ShowDetailView({ initialSeasonParam = null, show }: ShowDetailViewProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<ActionMessage | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [activeSeasonNumber, setActiveSeasonNumber] = useState(
    () => getShowDetailSeasonNavigation(show, initialSeasonParam).activeSeasonNumber,
  );

  const seasonNavigation = getShowDetailSeasonNavigation(show, activeSeasonNumber);

  useEffect(() => {
    if (activeSeasonNumber !== seasonNavigation.activeSeasonNumber) {
      setActiveSeasonNumber(seasonNavigation.activeSeasonNumber);
    }
  }, [activeSeasonNumber, seasonNavigation.activeSeasonNumber]);

  function runAction(
    actionId: string,
    action: () => Promise<ShowProgressActionResult>,
    fallbackMessage = "Unable to update progress right now.",
  ) {
    setMessage(null);
    setPendingAction(actionId);

    startTransition(() => {
      void (async () => {
        try {
          const result = await action();
          setMessage({
            message: result.message,
            status: result.status,
          });

          if (result.status === "success") {
            router.refresh();
          }
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

  function handleFavouriteToggle() {
    runAction(
      "show:favourite",
      () => updateShowFavouriteAction({
        favourite: !show.favourite,
        tmdbId: show.tmdbId,
      }),
      "Unable to update this favourite right now.",
    );
  }

  function handleDropToggle() {
    const dropped = !controls.isDropped;

    if (dropped && !window.confirm(`Drop ${show.title}? Your watched progress will be preserved.`)) {
      return;
    }

    runAction(
      "show:drop",
      () => updateShowDroppedAction({
        dropped,
        tmdbId: show.tmdbId,
      }),
      "Unable to update this show right now.",
    );
  }

  function handleEpisodeToggle(episode: ShowDetailEpisode, watched: boolean) {
    if (!watched && !window.confirm(`Mark "${episode.title}" unwatched?`)) {
      return;
    }

    runAction(getEpisodeActionId(episode, watched), () =>
      setEpisodeWatchedAction({
        episodeNumber: episode.episodeNumber,
        seasonNumber: episode.seasonNumber,
        tmdbId: show.tmdbId,
        watched,
      }),
    );
  }

  function handleSeasonToggle(season: ShowDetailSeason, watched: boolean) {
    if (!watched && !window.confirm(`Mark ${season.name} unwatched?`)) {
      return;
    }

    runAction(getSeasonActionId(season.seasonNumber, watched), () =>
      setSeasonWatchedAction({
        seasonNumber: season.seasonNumber,
        tmdbId: show.tmdbId,
        watched,
      }),
    );
  }

  function handleMarkShowWatched() {
    runAction("show:watch", () => markShowWatchedAction(show.tmdbId));
  }

  function handleResetShow() {
    if (!window.confirm(`Reset all watched progress for ${show.title}?`)) {
      return;
    }

    runAction("show:reset", () => resetShowProgressAction(show.tmdbId));
  }

  function updateActiveSeason(seasonNumber: number | null) {
    if (seasonNumber === null || seasonNumber === activeSeasonNumber) {
      return;
    }

    setActiveSeasonNumber(seasonNumber);

    window.history.replaceState(
      null,
      "",
      getShowDetailSeasonUrl(window.location.pathname, window.location.search, seasonNumber),
    );
  }

  const showComplete =
    show.progress.totalEpisodeCount > 0
    && show.progress.watchedEpisodeCount >= show.progress.totalEpisodeCount;
  const controls = getShowDetailActionLabels(show);
  const firstAirDate = formatDate(show.firstAirDate);

  return (
    <section className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <Card>
        <CardContent className="flex flex-col gap-6 p-5 pt-5 sm:p-6 sm:pt-6 md:flex-row">
          <ShowPoster show={show} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-2">
                  <h1 className="truncate text-3xl font-semibold tracking-tight">{show.title}</h1>
                  {show.favourite ? <Star className="size-5 shrink-0 fill-primary text-primary" /> : null}
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span className="rounded-full border px-2 py-1">
                    {controls.statusLabel}
                  </span>
                  {show.tmdbStatus ? <span className="rounded-full border px-2 py-1">{show.tmdbStatus}</span> : null}
                  {firstAirDate ? <span className="rounded-full border px-2 py-1">{firstAirDate}</span> : null}
                </div>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap lg:justify-end">
                <Button
                  aria-label={controls.favouriteAriaLabel}
                  aria-pressed={show.favourite}
                  className="w-full gap-2 sm:w-36"
                  disabled={isPending}
                  onClick={handleFavouriteToggle}
                  type="button"
                  variant={show.favourite ? "secondary" : "outline"}
                >
                  {pendingAction === "show:favourite" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Star className={cn("size-4", show.favourite && "fill-primary text-primary")} />
                  )}
                  {controls.favouriteButtonLabel}
                </Button>
                <Button
                  aria-label={controls.toggleDroppedAriaLabel}
                  className="w-full gap-2 sm:w-36"
                  disabled={isPending}
                  onClick={handleDropToggle}
                  type="button"
                  variant={controls.isDropped ? "default" : "outline"}
                >
                  {pendingAction === "show:drop" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : controls.isDropped ? (
                    <Play className="size-4" />
                  ) : (
                    <CircleSlash className="size-4" />
                  )}
                  {controls.toggleDroppedButtonLabel}
                </Button>
                <Button
                  className="w-full gap-2 sm:w-40"
                  disabled={isPending || show.progress.totalEpisodeCount === 0 || showComplete}
                  onClick={handleMarkShowWatched}
                  type="button"
                >
                  {pendingAction === "show:watch" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Check className="size-4" />
                  )}
                  Mark watched
                </Button>
                <Button
                  className="w-full gap-2 sm:w-36"
                  disabled={isPending || show.progress.watchedEpisodeCount === 0}
                  onClick={handleResetShow}
                  type="button"
                  variant="outline"
                >
                  {pendingAction === "show:reset" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <RotateCcw className="size-4" />
                  )}
                  Reset
                </Button>
              </div>
            </div>

            {show.overview ? <p className="mt-5 max-w-3xl text-sm text-muted-foreground">{show.overview}</p> : null}

            <div className="mt-6">
              <ProgressBar
                label="Main progress"
                progressPercentage={show.progress.progressPercentage}
                totalEpisodeCount={show.progress.totalEpisodeCount}
                watchedEpisodeCount={show.progress.watchedEpisodeCount}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {controls.isDropped ? (
        <Notice className="border-primary/30 bg-primary/10 text-foreground">
          <div className="space-y-1">
            <p className="font-medium">Dropped show</p>
            <p className="text-muted-foreground">
              {controls.droppedDescription} Resume this show to return it to its progress-derived status.
            </p>
          </div>
        </Notice>
      ) : null}

      <TmdbAttribution tmdbId={show.tmdbId} />

      {message ? (
        <Notice tone={message.status === "error" ? "error" : "success"}>{message.message}</Notice>
      ) : null}

      {show.seasons.length === 0 ? (
        <EmptyState
          description="TMDB has not provided season or episode metadata for this show yet."
          title="No episodes available"
        />
      ) : (
        <div className="grid gap-4">
          <Card>
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
              <label className="flex min-w-0 flex-1 items-center gap-2 text-sm text-muted-foreground">
                Season
                <select
                  className="h-9 min-w-0 flex-1 rounded-md border bg-background px-3 py-1 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 sm:max-w-xs"
                  onChange={(event) => updateActiveSeason(Number(event.target.value))}
                  value={seasonNavigation.activeSeasonNumber ?? ""}
                >
                  {seasonNavigation.seasonOptions.map((seasonOption) => (
                    <option key={seasonOption.seasonNumber} value={seasonOption.seasonNumber}>
                      {seasonOption.label}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
                <Button
                  className="gap-2"
                  disabled={seasonNavigation.previousSeasonNumber === null}
                  onClick={() => updateActiveSeason(seasonNavigation.previousSeasonNumber)}
                  type="button"
                  variant="outline"
                >
                  <ChevronLeft className="size-4" />
                  Previous
                </Button>
                <Button
                  className="gap-2"
                  disabled={seasonNavigation.nextSeasonNumber === null}
                  onClick={() => updateActiveSeason(seasonNavigation.nextSeasonNumber)}
                  type="button"
                  variant="outline"
                >
                  Next
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </CardContent>
          </Card>

          {seasonNavigation.activeSeason ? (
            <SeasonPanel
              key={seasonNavigation.activeSeason.seasonNumber}
              disabled={isPending}
              onSeasonToggle={handleSeasonToggle}
              onToggleEpisode={handleEpisodeToggle}
              pendingAction={pendingAction}
              season={seasonNavigation.activeSeason}
            />
          ) : (
            <EmptyState
              description="TMDB has not provided season or episode metadata for this show yet."
              title="No season selected"
            />
          )}
        </div>
      )}
    </section>
  );
}

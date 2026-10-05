"use client";

import { Check, CheckCheck, ChevronLeft, ChevronRight, CircleSlash, Loader2, Play, RefreshCw, RotateCcw, Star, Undo2 } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import {
  ACTION_FEEDBACK_AUTO_DISMISS_MS,
  ActionFeedback,
} from "@/components/ui/action-feedback";
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
import { formatDateOnly } from "../../../lib/date-only";
import { formatTimestamp } from "../../../lib/date-time";

import {
  markShowWatchedAction,
  refreshShowMetadataAction,
  resetShowProgressAction,
  setEpisodeWatchedAction,
  setSeasonWatchedAction,
} from "../actions";
import {
  applyOptimisticEpisodeWatched,
  getSeasonLabel,
  getShowDetailActionLabels,
  getShowDetailEpisodeKey,
  getShowDetailSeasonNavigation,
  getShowDetailSeasonUrl,
  isShowDetailEpisodeTrackable,
  SPECIALS_OPTIONAL_NOTE,
} from "../view-model";
import type { ShowDetail, ShowDetailEpisode, ShowDetailSeason, ShowProgressActionResult } from "../types";
import { EpisodeMutationQueue } from "../episode-mutation-queue";

type ShowDetailViewProps = {
  initialSeasonParam?: string | null;
  referenceDate?: string;
  show: ShowDetail;
  timeZone?: string;
};

type ActionMessage = {
  message: string;
  status: "error" | "success";
};

function getSeasonActionId(seasonNumber: number, watched: boolean) {
  return `season:${seasonNumber}:${watched ? "watch" : "unwatch"}`;
}

function episodeSectionId(tmdbId: number, episode: ShowDetailEpisode) {
  return `show-${tmdbId}-episode-${episode.seasonNumber}-${episode.episodeNumber}`;
}

function ShowPoster({ show }: { show: ShowDetail }) {
  const posterUrl = getTmdbImageUrl(show.posterPath, "w342");
  const posterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const poster = posterRef.current;
    const header = poster?.parentElement;
    const content = header?.querySelector<HTMLElement>("[data-show-header-content]");
    if (!poster || !header || !content || typeof ResizeObserver === "undefined") return;

    let frame = 0;
    const resizePoster = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        // On phones this content uses display: contents and the poster keeps its compact width.
        if (content.offsetHeight === 0) return;
        // Preserve the poster ratio; bound exceptionally long summaries so text stays readable.
        const width = Math.min(content.offsetHeight * 2 / 3, header.clientWidth * 0.3);
        poster.style.setProperty("--show-poster-width", `${width}px`);
      });
    };
    const observer = new ResizeObserver(resizePoster);
    observer.observe(content);
    observer.observe(header);
    resizePoster();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div className="relative aspect-[2/3] w-20 shrink-0 overflow-hidden rounded-md bg-secondary sm:w-24 md:w-[var(--show-poster-width,9rem)] md:self-start" ref={posterRef}>
      {posterUrl ? (
        <Image
          alt={`${show.title} poster`}
          className="object-cover"
          fill
          priority
          sizes="(min-width: 768px) 240px, (min-width: 640px) 96px, 80px"
          src={posterUrl}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-3xl font-semibold text-muted-foreground">
          {show.title.charAt(0)}
        </div>
      )}
    </div>
  );
}

function EpisodeRow({
  canMarkWatched,
  disabled,
  episode,
  onToggle,
  pending,
  showTmdbId,
}: {
  canMarkWatched: boolean;
  disabled: boolean;
  episode: ShowDetailEpisode;
  onToggle: (episode: ShowDetailEpisode, watched: boolean) => void;
  pending: boolean;
  showTmdbId: number;
}) {
  const nextWatched = !episode.watched;
  const airDate = formatDateOnly(episode.airDate);
  const releaseAvailability = !episode.watched && !canMarkWatched && airDate
    ? `Available ${airDate}`
    : undefined;
  const actionDisabled = disabled || pending || (!episode.watched && !canMarkWatched);
  const actionLabel = `${episode.watched ? "Mark unwatched" : "Mark watched"}: ${episode.episodeNumber}. ${episode.title}${releaseAvailability ? ` — ${releaseAvailability}` : ""}`;

  return (
    <div className="grid scroll-mt-36 grid-cols-[auto_minmax(0,1fr)] items-start gap-3 border-t py-3 first:border-t-0 md:scroll-mt-20" id={episodeSectionId(showTmdbId, episode)} tabIndex={-1}>
      <Button
        aria-label={actionLabel}
        aria-pressed={episode.watched}
        aria-busy={pending}
        className="size-11 shrink-0"
        disabled={actionDisabled}
        onClick={() => {
          if (!actionDisabled) {
            onToggle(episode, nextWatched);
          }
        }}
        size="icon"
        title={actionLabel}
        type="button"
        variant={episode.watched ? "outline" : "default"}
      >
        {pending ? <Loader2 aria-hidden="true" className="size-5 animate-spin" /> : episode.watched ? <Undo2 aria-hidden="true" className="size-5" /> : <Check aria-hidden="true" className="size-5" />}
        <span className="sr-only">{episode.watched ? "Mark unwatched" : "Mark watched"}</span>
      </Button>
      <div className="min-w-0">
        <h3 className="break-words text-sm font-medium leading-5 md:text-base">
          {episode.episodeNumber}. {episode.title}
        </h3>
        <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
          {airDate ? <span>{releaseAvailability ?? airDate}</span> : null}
          {episode.runtimeMinutes ? <span>{episode.runtimeMinutes} min</span> : null}
        </div>
        {episode.overview ? <p className="mt-2 break-words text-sm leading-6 text-muted-foreground">{episode.overview}</p> : null}
      </div>
    </div>
  );
}

function SeasonPanel({
  bulkDisabled,
  episodeDisabled,
  onSeasonToggle,
  onToggleEpisode,
  pendingAction,
  pendingEpisodeKeys,
  referenceDate,
  season,
  showTmdbId,
  timeZone,
}: {
  bulkDisabled: boolean;
  episodeDisabled: boolean;
  onSeasonToggle: (season: ShowDetailSeason, watched: boolean) => void;
  onToggleEpisode: (episode: ShowDetailEpisode, watched: boolean) => void;
  pendingAction: string | null;
  pendingEpisodeKeys: ReadonlySet<string>;
  referenceDate?: string;
  season: ShowDetailSeason;
  showTmdbId: number;
  timeZone: string;
}) {
  const seasonComplete =
    season.progress.totalEpisodeCount > 0
    && season.progress.watchedEpisodeCount >= season.progress.totalEpisodeCount;
  const nextWatched = !seasonComplete;
  const actionId = getSeasonActionId(season.seasonNumber, nextWatched);
  const isPending = pendingAction === actionId;
  const airDate = formatDateOnly(season.airDate);
  const actionLabel = `Mark ${getSeasonLabel(season)} ${seasonComplete ? "unwatched" : "watched"}`;

  return (
    <Card>
      <CardHeader className="flex-row items-start gap-3 space-y-0">
        <Button
          aria-label={actionLabel}
          aria-busy={isPending}
          className="size-11 shrink-0"
          disabled={bulkDisabled || season.progress.totalEpisodeCount === 0 || isPending}
          onClick={() => onSeasonToggle(season, nextWatched)}
          size="icon"
          title={actionLabel}
          type="button"
          variant={seasonComplete ? "outline" : "default"}
        >
          {isPending ? <Loader2 aria-hidden="true" className="size-5 animate-spin" /> : seasonComplete ? <Undo2 aria-hidden="true" className="size-5" /> : <CheckCheck aria-hidden="true" className="size-5" />}
          <span className="sr-only">{seasonComplete ? "Unwatch season" : "Watch season"}</span>
        </Button>
        <div className="min-w-0 flex-1">
          <CardTitle>
            {getSeasonLabel(season)}
            {airDate ? <span className="ml-2 text-sm font-normal text-muted-foreground">{airDate}</span> : null}
          </CardTitle>
          {season.overview ? <p className="mt-2 break-words text-sm leading-6 text-muted-foreground">{season.overview}</p> : null}
        </div>
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
                canMarkWatched={isShowDetailEpisodeTrackable(showTmdbId, episode, { referenceDate, timeZone })}
                key={`${episode.seasonNumber}-${episode.episodeNumber}`}
                disabled={episodeDisabled}
                episode={episode}
                onToggle={onToggleEpisode}
                pending={pendingEpisodeKeys.has(getShowDetailEpisodeKey(episode))}
                showTmdbId={showTmdbId}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function ShowDetailView({
  initialSeasonParam = null,
  referenceDate,
  show,
  timeZone = "UTC",
}: ShowDetailViewProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<ActionMessage | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [watchedOverrides, setWatchedOverrides] = useState<Record<string, boolean>>({});
  const [pendingEpisodeKeys, setPendingEpisodeKeys] = useState<Set<string>>(() => new Set());
  const [activeSeasonNumber, setActiveSeasonNumber] = useState(
    () => getShowDetailSeasonNavigation(show, initialSeasonParam, { referenceDate, timeZone }).activeSeasonNumber,
  );
  const mountedRef = useRef(true);
  const previousShowRef = useRef(show);
  const latestShowRef = useRef(show);
  const actionInFlightRef = useRef(false);
  const bulkTrackingRef = useRef(false);
  const episodeQueueRef = useRef<EpisodeMutationQueue | null>(null);
  latestShowRef.current = show;

  function reconcileResolvedWatchedOverrides() {
    // Action RSC props can arrive before the queue settles; keep unresolved rows optimistic.
    const serverWatched = new Map(
      latestShowRef.current.seasons.flatMap((season) =>
        season.episodes.map((episode) => [getShowDetailEpisodeKey(episode), episode.watched] as const),
      ),
    );
    setWatchedOverrides((current) => {
      const next = { ...current };
      let changed = false;
      for (const [key, watched] of Object.entries(current)) {
        if (!episodeQueueRef.current?.isPending(key) && serverWatched.get(key) === watched) {
          delete next[key];
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }

  if (!episodeQueueRef.current) {
    episodeQueueRef.current = new EpisodeMutationQueue(
      setEpisodeWatchedAction,
      (mutation, result) => {
        if (!mountedRef.current) return;
        if (result.status === "error") {
          setWatchedOverrides((current) => ({
            ...current,
            [mutation.episodeKey]: mutation.previousWatched,
          }));
        }
        setMessage((current) => result.status === "error" || current?.status !== "error" ? result : current);
      },
      (keys) => {
        if (mountedRef.current) setPendingEpisodeKeys(keys);
      },
      () => {
        if (mountedRef.current) reconcileResolvedWatchedOverrides();
      },
    );
  }

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (previousShowRef.current === show) return;
    previousShowRef.current = show;
    if (!episodeQueueRef.current?.hasPending) {
      setWatchedOverrides({});
    } else {
      reconcileResolvedWatchedOverrides();
    }
  }, [show]);

  const displayShow = applyOptimisticEpisodeWatched(show, watchedOverrides, { referenceDate, timeZone });
  const seasonNavigation = getShowDetailSeasonNavigation(displayShow, activeSeasonNumber, { referenceDate, timeZone });
  const bulkDisabled = pendingEpisodeKeys.size > 0 || pendingAction !== null || isPending;
  const episodeDisabled = pendingAction !== null && pendingAction !== "show:favourite";

  useEffect(() => {
    if (activeSeasonNumber !== seasonNavigation.activeSeasonNumber) {
      setActiveSeasonNumber(seasonNavigation.activeSeasonNumber);
    }
  }, [activeSeasonNumber, seasonNavigation.activeSeasonNumber]);

  function runAction(
    actionId: string,
    action: () => Promise<ShowProgressActionResult>,
    fallbackMessage = "Unable to update progress right now.",
    blocksEpisodeMutations = true,
  ) {
    if (actionInFlightRef.current || (blocksEpisodeMutations && episodeQueueRef.current?.hasPending)) {
      return;
    }

    actionInFlightRef.current = true;
    bulkTrackingRef.current = blocksEpisodeMutations;
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
          actionInFlightRef.current = false;
          bulkTrackingRef.current = false;
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
      false,
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
    const episodeKey = getShowDetailEpisodeKey(episode);
    if (bulkTrackingRef.current || episodeQueueRef.current?.isPending(episodeKey)) {
      return;
    }
    if (watched && !isShowDetailEpisodeTrackable(show.tmdbId, episode, { referenceDate, timeZone })) {
      return;
    }
    setWatchedOverrides((current) => ({ ...current, [episodeKey]: watched }));
    setMessage(null);
    episodeQueueRef.current?.enqueue({
      episodeKey,
      input: {
        episodeNumber: episode.episodeNumber,
        seasonNumber: episode.seasonNumber,
        tmdbId: show.tmdbId,
        watched,
      },
      previousWatched: episode.watched,
    });
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

  function handleRefreshMetadata() {
    runAction(
      "show:refresh",
      () => refreshShowMetadataAction(show.tmdbId),
      "Unable to refresh metadata right now.",
    );
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
    displayShow.progress.totalEpisodeCount > 0
    && displayShow.progress.watchedEpisodeCount >= displayShow.progress.totalEpisodeCount;
  const controls = getShowDetailActionLabels(displayShow);
  const firstAirDate = formatDateOnly(show.firstAirDate);
  const lastSyncedAt = formatTimestamp(show.lastSyncedAt, "en", { timeZone });

  return (
    <section className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <Card>
        <CardContent className="grid grid-cols-[5rem_minmax(0,1fr)] items-start gap-4 p-4 sm:grid-cols-[6rem_minmax(0,1fr)] sm:p-5 md:flex md:items-stretch md:p-6">
          <ShowPoster show={show} />
          <div className="contents md:flex md:min-w-0 md:flex-1 md:flex-col md:gap-4 md:self-start" data-show-header-content>
            <div className="contents">
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-2">
                  <h1 className="break-words text-xl font-semibold leading-tight tracking-tight sm:text-2xl md:text-3xl">{show.title}</h1>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span className="rounded-full border px-2 py-1">
                    {controls.statusLabel}
                  </span>
                  {show.tmdbStatus ? <span className="rounded-full border px-2 py-1">{show.tmdbStatus}</span> : null}
                  {firstAirDate ? <span className="rounded-full border px-2 py-1">{firstAirDate}</span> : null}
                </div>
              </div>

              <div className="col-span-2 flex flex-wrap gap-2 md:col-span-1 md:col-start-2">
                <Button
                  aria-label={controls.favouriteAriaLabel}
                  aria-pressed={show.favourite}
                  className="size-11 [&_svg]:size-5"
                  disabled={isPending}
                  onClick={handleFavouriteToggle}
                  size="icon"
                  title={controls.favouriteButtonLabel}
                  type="button"
                  variant="outline"
                >
                  {pendingAction === "show:favourite" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Star className={cn("size-4", show.favourite && "fill-primary text-primary")} />
                  )}
                </Button>
                <Button
                  aria-label={controls.toggleDroppedAriaLabel}
                  className="size-11 [&_svg]:size-5"
                  disabled={bulkDisabled}
                  onClick={handleDropToggle}
                  size="icon"
                  title={controls.toggleDroppedButtonLabel}
                  type="button"
                  variant="outline"
                >
                  {pendingAction === "show:drop" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : controls.isDropped ? (
                    <Play className="size-4" />
                  ) : (
                    <CircleSlash className="size-4" />
                  )}
                </Button>
                <Button
                  aria-label={`Mark all main episodes of ${show.title} watched`}
                  className="size-11 [&_svg]:size-5"
                  disabled={bulkDisabled || displayShow.progress.totalEpisodeCount === 0 || showComplete}
                  onClick={handleMarkShowWatched}
                  size="icon"
                  title="Mark watched"
                  type="button"
                >
                  {pendingAction === "show:watch" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Check className="size-4" />
                  )}
                </Button>
                <Button
                  aria-label={`Reset all watched progress for ${show.title}`}
                  className="size-11 [&_svg]:size-5"
                  disabled={bulkDisabled || displayShow.progress.watchedEpisodeCount === 0}
                  onClick={handleResetShow}
                  size="icon"
                  title="Reset"
                  type="button"
                  variant="outline"
                >
                  {pendingAction === "show:reset" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <RotateCcw className="size-4" />
                  )}
                </Button>
                <Button
                  aria-label={`Refresh metadata for ${show.title}`}
                  aria-busy={pendingAction === "show:refresh"}
                  className="size-11 [&_svg]:size-5"
                  disabled={bulkDisabled || pendingAction === "show:refresh"}
                  onClick={handleRefreshMetadata}
                  size="icon"
                  title={pendingAction === "show:refresh" ? "Refreshing" : "Refresh metadata"}
                  type="button"
                  variant="outline"
                >
                  {pendingAction === "show:refresh" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <RefreshCw className="size-4" />
                  )}
                </Button>
              </div>
            </div>

            <div className="col-span-2 min-w-0 md:col-span-1 md:col-start-2">
            {show.overview ? <p className="max-w-3xl break-words text-sm leading-6 text-muted-foreground">{show.overview}</p> : null}
            {lastSyncedAt ? (
              <p className="mt-3 text-xs text-muted-foreground">Metadata last refreshed {lastSyncedAt}</p>
            ) : null}

            <div className="mt-4">
              <ProgressBar
                label="Main progress"
                progressPercentage={displayShow.progress.progressPercentage}
                totalEpisodeCount={displayShow.progress.totalEpisodeCount}
                watchedEpisodeCount={displayShow.progress.watchedEpisodeCount}
              />
            </div>
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
        <ActionFeedback
          autoDismissMs={message.status === "success" ? ACTION_FEEDBACK_AUTO_DISMISS_MS : undefined}
          dismissible
          feedbackKey={message}
          presentation="toast"
          tone={message.status === "error" ? "error" : "success"}
        >
          {message.message}
        </ActionFeedback>
      ) : null}

      {displayShow.seasons.length === 0 ? (
        <EmptyState
          description="TMDB has not provided season or episode metadata for this show yet."
          title="No episodes available"
        />
      ) : (
        <div className="grid min-w-0 grid-cols-1 gap-4">
          <Card className="scroll-mt-20" id="season-controls" tabIndex={-1}>
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
              <div className="flex min-w-0 flex-1 items-center gap-2 text-sm text-muted-foreground">
                <label className="shrink-0" htmlFor={`show-${show.tmdbId}-season`}>Season</label>
                <select
                  className="field-focus h-11 w-full min-w-0 flex-1 rounded-md border bg-background px-3 py-1 text-base text-foreground sm:max-w-xs sm:text-sm"
                  id={`show-${show.tmdbId}-season`}
                  onChange={(event) => updateActiveSeason(Number(event.target.value))}
                  value={seasonNavigation.activeSeasonNumber ?? ""}
                >
                  {seasonNavigation.seasonOptions.map((seasonOption) => (
                    <option key={seasonOption.seasonNumber} value={seasonOption.seasonNumber}>
                      {seasonOption.label}
                    </option>
                  ))}
                </select>
              </div>

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
              bulkDisabled={bulkDisabled}
              episodeDisabled={episodeDisabled}
              onSeasonToggle={handleSeasonToggle}
              onToggleEpisode={handleEpisodeToggle}
              pendingAction={pendingAction}
              pendingEpisodeKeys={pendingEpisodeKeys}
              referenceDate={referenceDate}
              season={seasonNavigation.activeSeason}
              showTmdbId={show.tmdbId}
              timeZone={timeZone}
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

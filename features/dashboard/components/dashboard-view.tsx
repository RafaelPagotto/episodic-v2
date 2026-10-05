"use client";

import { FADED_SHOW_CARD_CLASS_NAME } from "../../preferences/card-appearance";

import {
  CalendarDays,
  Check,
  Loader2,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { LibrarySummaryTiles } from "@/components/library-summary-tiles";
import {
  ACTION_FEEDBACK_AUTO_DISMISS_MS,
  ActionFeedback,
} from "@/components/ui/action-feedback";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ProgressBar } from "@/components/ui/progress-bar";
import { getTmdbImageUrl } from "@/lib/tmdb/images";
import { cn } from "@/lib/utils";
import { formatDateOnly } from "../../../lib/date-only";

import { markContinueWatchingEpisodeWatchedAction } from "../actions";
import { ContinueWatchingMutationQueue } from "../continue-watching-mutation-queue";
import type {
  ContinueWatchingItem,
  DashboardData,
  StartWatchingItem,
  UpcomingEpisodeItem,
} from "../types";

type DashboardViewProps = {
  data: DashboardData;
};

type ActionMessage = {
  message: string;
  status: "error" | "success";
};

function formatUpcomingAirDate(airDate: string) {
  return formatDateOnly(airDate) ?? airDate;
}

function UpcomingEpisodeCard({ item }: { item: UpcomingEpisodeItem }) {
  const episodeCode = `S${item.seasonNumber}E${item.episodeNumber}`;
  const posterUrl = getTmdbImageUrl(item.posterPath, "w185");

  return (
    <Card className="flex h-full bg-card/70">
      <CardContent className="flex min-h-24 flex-1 items-center gap-3 p-3 pt-3 sm:p-3 sm:pt-3">
        <Link
          aria-label={`View details for ${item.showTitle} poster`}
          className="poster-link poster-surface shrink-0"
          href={item.detailHref}
        >
          {posterUrl ? (
            <Image
              alt={`${item.showTitle} poster`}
              className="aspect-[2/3] w-14 object-cover"
              height={278}
              sizes="56px"
              src={posterUrl}
              width={185}
            />
          ) : (
            <div aria-hidden="true" className="flex aspect-[2/3] w-14 items-center justify-center bg-secondary text-sm font-semibold text-muted-foreground">
              {item.showTitle.charAt(0)}
            </div>
          )}
        </Link>
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 min-w-0 break-words text-sm font-medium leading-6">
            <Link
              aria-label={`View details for ${item.showTitle}`}
              className="title-link"
              href={item.detailHref}
            >
              {item.showTitle}
            </Link>
          </h3>
          <p className="mt-1 line-clamp-2 text-xs leading-snug text-muted-foreground" title={item.episodeTitle ? `${episodeCode} - ${item.episodeTitle}` : episodeCode}>
            <span className="font-semibold text-foreground">{episodeCode}</span>
            {item.episodeTitle ? ` - ${item.episodeTitle}` : null}
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <CalendarDays aria-hidden="true" className="size-3.5" />
            {formatUpcomingAirDate(item.airDate)}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function StartWatchingCard({ item }: { item: StartWatchingItem }) {
  const episodeCode = `S${item.seasonNumber}E${item.episodeNumber}`;
  const posterUrl = getTmdbImageUrl(item.posterPath, "w342");

  return (
    <Link
      aria-label={`Start watching ${item.showTitle} at ${episodeCode}`}
      className="poster-link group/start relative min-w-0"
      href={item.detailHref}
    >
      <div className="poster-surface aspect-[2/3] bg-secondary">
        {posterUrl ? (
          <Image
            alt={`${item.showTitle} poster`}
            className="h-full w-full object-cover"
            height={513}
            sizes="(max-width: 639px) 50vw, 180px"
            src={posterUrl}
            width={342}
          />
        ) : (
          <div aria-hidden="true" className="flex h-full items-center justify-center p-3 text-center text-sm font-semibold text-muted-foreground">
            <span className="break-words">{item.showTitle}</span>
          </div>
        )}
        {posterUrl ? (
          <span
            aria-hidden="true"
            className="pointer-events-none invisible absolute inset-x-0 bottom-0 z-10 border-t bg-card px-2 py-2 text-center text-xs font-medium leading-snug text-card-foreground group-hover/start:visible group-focus-visible/start:visible [@media(hover:none)]:visible [@media(pointer:coarse)]:visible"
          >
            <span className="line-clamp-3 break-words">{item.showTitle}</span>
          </span>
        ) : null}
      </div>
    </Link>
  );
}

function ContinuePoster({ item }: { item: ContinueWatchingItem }) {
  const posterUrl = getTmdbImageUrl(item.posterPath, "w185");
  const href = `/shows/${item.tmdbId}`;
  const linkClassName = "poster-link poster-surface shrink-0";

  if (!posterUrl) {
    return (
      <Link aria-label={`View details for ${item.title} poster`} className={linkClassName} href={href}>
        <div className="flex aspect-[2/3] w-20 items-center justify-center bg-secondary text-lg font-semibold text-muted-foreground">
          {item.title.charAt(0)}
        </div>
      </Link>
    );
  }

  return (
    <Link aria-label={`View details for ${item.title} poster`} className={linkClassName} href={href}>
      <Image
        alt={`${item.title} poster`}
        className="aspect-[2/3] w-20 object-cover"
        height={278}
        sizes="80px"
        src={posterUrl}
        width={185}
      />
    </Link>
  );
}

function ContinueWatchingCard({
  item,
  onMarkNextWatched,
  pending,
}: {
  item: ContinueWatchingItem;
  onMarkNextWatched: (item: ContinueWatchingItem) => void;
  pending: boolean;
}) {
  const nextEpisodeLabel = `S${item.nextEpisode.seasonNumber}E${item.nextEpisode.episodeNumber}`;

  return (
    <Card className={cn("group/continue overflow-hidden", item.isFaded && FADED_SHOW_CARD_CLASS_NAME)}>
      <CardContent className="flex items-center gap-3 p-3 sm:p-4">
        <div className="relative w-20 shrink-0">
          <ContinuePoster item={item} />
          <Button
            aria-label={pending ? `Marking ${item.title} ${nextEpisodeLabel} watched` : `Mark ${item.title} ${nextEpisodeLabel} watched`}
            aria-busy={pending}
            className={cn(
              "absolute bottom-1.5 left-1/2 z-10 -translate-x-1/2 shadow-md",
              // Hover-capable pointers reveal on hover/focus; touch keeps the action visible.
              !pending && "[@media(hover:hover)_and_(pointer:fine)]:pointer-events-none [@media(hover:hover)_and_(pointer:fine)]:opacity-0 group-hover/continue:pointer-events-auto group-hover/continue:opacity-100 group-focus-within/continue:pointer-events-auto group-focus-within/continue:opacity-100",
            )}
            disabled={pending}
            onClick={() => onMarkNextWatched(item)}
            size="icon"
            title={pending ? `Marking ${nextEpisodeLabel} watched` : `Mark ${nextEpisodeLabel} watched`}
            type="button"
          >
            {pending ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <Check aria-hidden="true" className="size-4" />}
          </Button>
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-center self-stretch">
          <div className="min-w-0">
            <h3 className="line-clamp-2 min-w-0 break-words text-base font-semibold leading-5">
              <Link
                aria-label={`View details for ${item.title}`}
                className="title-link"
                href={`/shows/${item.tmdbId}`}
              >
                {item.title}
              </Link>
            </h3>
            <p className="mt-1 line-clamp-2 break-words text-sm text-muted-foreground" title={`${nextEpisodeLabel} - ${item.nextEpisode.title}`}>
              <span className="font-medium text-foreground">{nextEpisodeLabel}</span> - {item.nextEpisode.title}
            </p>
          </div>
          <div className="mt-3">
            <ProgressBar
              progressPercentage={item.progressPercentage}
              totalEpisodeCount={item.totalEpisodeCount}
              watchedEpisodeCount={item.watchedEpisodeCount}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyContinueWatchingState({
  hasHiddenItems,
  hasShows,
}: {
  hasHiddenItems: boolean;
  hasShows: boolean;
}) {
  if (hasHiddenItems) {
    return (
      <EmptyState
        description="Adjust your profile preferences to show hidden in-progress shows."
        title="No visible in-progress shows"
      />
    );
  }

  return (
    <EmptyState
      action={
        !hasShows ? (
          <Button asChild>
            <Link href="/search">Search shows</Link>
          </Button>
        ) : null
      }
      description={
        hasShows
          ? "Mark an episode watched to start Continue Watching."
          : "Add your first show and your dashboard will fill in automatically."
      }
      title={hasShows ? "No in-progress shows yet" : "Your library is empty"}
    />
  );
}

export function DashboardView({ data }: DashboardViewProps) {
  const [message, setMessage] = useState<ActionMessage | null>(null);
  const [pendingShowIds, setPendingShowIds] = useState<Set<number>>(() => new Set());
  const pendingShowIdsRef = useRef(pendingShowIds);
  const submittedEpisodesRef = useRef(new Map<number, ContinueWatchingItem["nextEpisode"]>());
  const mountedRef = useRef(true);
  const previousDataRef = useRef(data);
  const latestDataRef = useRef(data);
  const queueRef = useRef<ContinueWatchingMutationQueue | null>(null);
  latestDataRef.current = data;

  function reconcileSettledPending() {
    // A returned RSC payload may arrive while later cards are still queued.
    let changed = false;
    for (const [showId, episode] of submittedEpisodesRef.current) {
      if (queueRef.current?.isPending(showId)) continue;
      const current = latestDataRef.current.continueWatching.find((item) => item.tmdbId === showId);
      if (!current || current.nextEpisode.seasonNumber !== episode.seasonNumber
        || current.nextEpisode.episodeNumber !== episode.episodeNumber) {
        submittedEpisodesRef.current.delete(showId);
        pendingShowIdsRef.current.delete(showId);
        changed = true;
      }
    }
    if (changed) setPendingShowIds(new Set(pendingShowIdsRef.current));
  }

  if (!queueRef.current) {
    queueRef.current = new ContinueWatchingMutationQueue(
      markContinueWatchingEpisodeWatchedAction,
      (mutation, result) => {
        if (!mountedRef.current) return;
        if (result.status === "error") {
          submittedEpisodesRef.current.delete(mutation.showId);
          pendingShowIdsRef.current.delete(mutation.showId);
          setPendingShowIds(new Set(pendingShowIdsRef.current));
        }
        setMessage((current) => result.status === "error" || current?.status !== "error" ? result : current);
      },
      () => {
        if (mountedRef.current) reconcileSettledPending();
      },
    );
  }

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (previousDataRef.current === data) return;
    previousDataRef.current = data;
    if (!queueRef.current?.hasPending) {
      submittedEpisodesRef.current.clear();
      pendingShowIdsRef.current = new Set();
      setPendingShowIds(new Set());
    } else {
      reconcileSettledPending();
    }
  }, [data]);

  const hasShows = data.summary.totalShows > 0;

  function handleMarkNextWatched(item: ContinueWatchingItem) {
    if (pendingShowIdsRef.current.has(item.tmdbId) || queueRef.current?.isPending(item.tmdbId)) return;

    pendingShowIdsRef.current.add(item.tmdbId);
    submittedEpisodesRef.current.set(item.tmdbId, item.nextEpisode);
    setPendingShowIds(new Set(pendingShowIdsRef.current));
    setMessage(null);
    queueRef.current?.enqueue({
      input: {
        episodeNumber: item.nextEpisode.episodeNumber,
        seasonNumber: item.nextEpisode.seasonNumber,
        tmdbId: item.tmdbId,
      },
      showId: item.tmdbId,
    });
  }

  return (
    <div className="flex min-w-0 flex-col gap-6 [container-type:inline-size]">
      <section aria-label="Library summary">
        <LibrarySummaryTiles summary={data.summary} />
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Continue Watching</h2>

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

        {data.continueWatching.length === 0 ? (
          <EmptyContinueWatchingState
            hasHiddenItems={data.hiddenContinueWatchingCount > 0}
            hasShows={hasShows}
          />
        ) : (
          <div className="grid gap-3 [@container_(min-width:40rem)]:grid-cols-2 [@container_(min-width:64rem)]:grid-cols-3">
            {data.continueWatching.map((item) => (
              <ContinueWatchingCard
                key={item.tmdbId}
                item={item}
                onMarkNextWatched={handleMarkNextWatched}
                pending={pendingShowIds.has(item.tmdbId)}
              />
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="upcoming-episodes-heading" className="space-y-3">
        <h2 id="upcoming-episodes-heading" className="text-lg font-semibold tracking-tight">
          Upcoming Episodes
        </h2>

        {data.upcomingEpisodes.length === 0 ? (
          <Card className="border-dashed bg-card/60">
            <CardContent className="p-4 text-sm text-muted-foreground">
              No known upcoming episodes for active shows right now.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-2 [@container_(min-width:40rem)]:grid-cols-2">
            {data.upcomingEpisodes.map((item) => (
              <UpcomingEpisodeCard key={`${item.tmdbId}:${item.seasonNumber}:${item.episodeNumber}`} item={item} />
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="start-watching-heading" className="space-y-3">
        <h2 id="start-watching-heading" className="text-lg font-semibold tracking-tight">
          Start Watching
        </h2>

        {data.startWatching.length === 0 ? (
          <Card className="border-dashed bg-card/60">
            <CardContent className="p-4 text-sm text-muted-foreground">
              No saved watchlist shows are ready to start right now.
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,8rem),1fr))] gap-3">
            {data.startWatching.map((item) => (
              <StartWatchingCard key={item.tmdbId} item={item} />
            ))}
          </div>
        )}
        <div className="flex justify-center pt-3">
          <Button asChild variant="outline">
            <Link href="/library?filter=watchlist">Open Watchlist</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}

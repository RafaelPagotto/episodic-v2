"use client";

import {
  CalendarDays,
  Check,
  Loader2,
  Play,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { LibrarySummaryTiles } from "@/components/library-summary-tiles";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";
import { ProgressBar } from "@/components/ui/progress-bar";
import { getTmdbImageUrl } from "@/lib/tmdb/images";
import { cn } from "@/lib/utils";
import { formatDateOnly } from "../../../lib/date-only";

import { markContinueWatchingEpisodeWatchedAction } from "../actions";
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

  return (
    <Card className="flex h-full bg-card/70">
      <CardContent className="flex min-h-20 flex-1 flex-col justify-center gap-3 p-3 pt-3 sm:flex-row sm:items-center sm:justify-between sm:p-3 sm:pt-3">
        <div className="min-w-0 flex-1">
          <p className="break-words text-sm font-medium leading-snug">{item.showTitle}</p>
          <p className="mt-1 break-words text-xs leading-snug text-muted-foreground">
            <span className="font-semibold text-foreground">{episodeCode}</span>
            {item.episodeTitle ? ` - ${item.episodeTitle}` : null}
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <CalendarDays aria-hidden="true" className="size-3.5" />
            {formatUpcomingAirDate(item.airDate)}
          </p>
        </div>
        <Button asChild className="w-full shrink-0 sm:w-auto" size="sm" variant="outline">
          <Link aria-label={`View details for ${item.showTitle} ${episodeCode}`} href={item.detailHref}>
            Details
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function StartWatchingPoster({ item }: { item: StartWatchingItem }) {
  const posterUrl = getTmdbImageUrl(item.posterPath, "w185");

  if (!posterUrl) {
    return (
      <div className="flex aspect-[2/3] w-14 shrink-0 items-center justify-center rounded-md bg-secondary text-sm font-semibold text-muted-foreground">
        {item.showTitle.charAt(0)}
      </div>
    );
  }

  return (
    <Image
      alt={`${item.showTitle} poster`}
      className="aspect-[2/3] w-14 shrink-0 rounded-md object-cover"
      height={278}
      sizes="56px"
      src={posterUrl}
      width={185}
    />
  );
}

function StartWatchingCard({ item }: { item: StartWatchingItem }) {
  const episodeCode = `S${item.seasonNumber}E${item.episodeNumber}`;

  return (
    <Card className="flex h-full bg-card/70">
      <CardContent className="flex min-h-24 flex-1 items-center gap-3 p-3 pt-3 sm:p-3 sm:pt-3">
        <StartWatchingPoster item={item} />
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-3">
          <div className="min-w-0">
            <p className="break-words text-sm font-medium leading-snug">{item.showTitle}</p>
            <p className="mt-1 break-words text-xs leading-snug text-muted-foreground">
              <span className="font-semibold text-foreground">{episodeCode}</span>
              {item.episodeTitle ? ` - ${item.episodeTitle}` : null}
            </p>
          </div>
          <Button asChild className="w-full sm:w-fit" size="sm" variant="outline">
            <Link aria-label={`Start watching ${item.showTitle} at ${episodeCode}`} href={item.detailHref}>
              Start watching
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ContinuePoster({ item }: { item: ContinueWatchingItem }) {
  const posterUrl = getTmdbImageUrl(item.posterPath, "w185");

  if (!posterUrl) {
    return (
      <div className="flex aspect-[2/3] w-20 shrink-0 items-center justify-center rounded-md bg-secondary text-lg font-semibold text-muted-foreground">
        {item.title.charAt(0)}
      </div>
    );
  }

  return (
    <Image
      alt={`${item.title} poster`}
      className="aspect-[2/3] w-20 shrink-0 rounded-md object-cover"
      height={278}
      sizes="80px"
      src={posterUrl}
      width={185}
    />
  );
}

function getContinueWatchingActionKey(item: ContinueWatchingItem) {
  return `${item.tmdbId}:${item.nextEpisode.seasonNumber}:${item.nextEpisode.episodeNumber}`;
}

function ContinueWatchingCard({
  disabled,
  item,
  onMarkNextWatched,
  pending,
}: {
  disabled: boolean;
  item: ContinueWatchingItem;
  onMarkNextWatched: (item: ContinueWatchingItem) => void;
  pending: boolean;
}) {
  const nextEpisodeLabel = `S${item.nextEpisode.seasonNumber}E${item.nextEpisode.episodeNumber}`;

  return (
    <Card className={cn("overflow-hidden", item.isFaded && "opacity-60")}>
      <CardContent className="flex gap-4 p-4 sm:p-5">
        <ContinuePoster item={item} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <h3 className="truncate text-base font-semibold">{item.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Next: S{item.nextEpisode.seasonNumber}E{item.nextEpisode.episodeNumber} -{" "}
                {item.nextEpisode.title}
              </p>
            </div>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row md:justify-end">
              <Button
                aria-label={`Mark ${item.title} ${nextEpisodeLabel} watched`}
                className="w-full gap-2 sm:w-auto"
                disabled={disabled || pending}
                onClick={() => onMarkNextWatched(item)}
                type="button"
              >
                {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                Mark {nextEpisodeLabel} watched
              </Button>
              <Button asChild className="w-full gap-2 sm:w-auto md:w-32" variant="outline">
                <Link href={`/shows/${item.tmdbId}`}>
                  <Play className="size-4" />
                  Details
                </Link>
              </Button>
            </div>
          </div>
          <div className="mt-5">
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
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<ActionMessage | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const hasShows = data.summary.totalShows > 0;

  function handleMarkNextWatched(item: ContinueWatchingItem) {
    const actionKey = getContinueWatchingActionKey(item);

    setMessage(null);
    setPendingAction(actionKey);

    startTransition(() => {
      void (async () => {
        try {
          const result = await markContinueWatchingEpisodeWatchedAction({
            episodeNumber: item.nextEpisode.episodeNumber,
            seasonNumber: item.nextEpisode.seasonNumber,
            tmdbId: item.tmdbId,
          });

          setMessage({
            message: result.message,
            status: result.status,
          });

          if (result.status === "success") {
            router.refresh();
          }
        } catch {
          setMessage({
            message: "Unable to update this episode right now.",
            status: "error",
          });
        } finally {
          setPendingAction(null);
        }
      })();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="library-summary-heading" className="space-y-3">
        <div>
          <h2 id="library-summary-heading" className="text-lg font-semibold tracking-tight">
            Library Summary
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Full library totals, including shows hidden by display preferences.
          </p>
        </div>
        <LibrarySummaryTiles summary={data.summary} />
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Continue Watching</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Pick up from the next unwatched episode in your active shows.
          </p>
        </div>

        {message ? (
          <Notice tone={message.status === "error" ? "error" : "success"}>{message.message}</Notice>
        ) : null}

        {data.continueWatching.length === 0 ? (
          <EmptyContinueWatchingState
            hasHiddenItems={data.hiddenContinueWatchingCount > 0}
            hasShows={hasShows}
          />
        ) : (
          <div className="grid gap-3">
            {data.continueWatching.map((item) => (
              <ContinueWatchingCard
                key={item.tmdbId}
                disabled={isPending || pendingAction !== null}
                item={item}
                onMarkNextWatched={handleMarkNextWatched}
                pending={pendingAction === getContinueWatchingActionKey(item)}
              />
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="upcoming-episodes-heading" className="space-y-3">
        <div>
          <h2 id="upcoming-episodes-heading" className="text-lg font-semibold tracking-tight">
            Upcoming Episodes
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Known future main-series episodes from your last TMDB import.
          </p>
        </div>

        {data.upcomingEpisodes.length === 0 ? (
          <Card className="border-dashed bg-card/60">
            <CardContent className="p-4 text-sm text-muted-foreground">
              No known upcoming episodes for active shows right now.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-2 lg:grid-cols-2">
            {data.upcomingEpisodes.map((item) => (
              <UpcomingEpisodeCard key={`${item.tmdbId}:${item.seasonNumber}:${item.episodeNumber}`} item={item} />
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="start-watching-heading" className="space-y-3">
        <div>
          <h2 id="start-watching-heading" className="text-lg font-semibold tracking-tight">
            Start Watching
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Pick a saved watchlist show and open its first available main-series episode.
          </p>
        </div>

        {data.startWatching.length === 0 ? (
          <Card className="border-dashed bg-card/60">
            <CardContent className="p-4 text-sm text-muted-foreground">
              No saved watchlist shows are ready to start right now.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {data.startWatching.map((item) => (
              <StartWatchingCard key={item.tmdbId} item={item} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

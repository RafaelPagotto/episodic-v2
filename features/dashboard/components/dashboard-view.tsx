import { CheckCircle2, CircleSlash, Heart, ListChecks, ListPlus, Play, Star } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { ComponentType } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ProgressBar } from "@/components/ui/progress-bar";
import { getTmdbImageUrl } from "@/lib/tmdb/images";
import { cn } from "@/lib/utils";

import type { ContinueWatchingItem, DashboardData } from "../types";

type DashboardViewProps = {
  data: DashboardData;
};

type SummaryCardProps = {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: number;
};

function SummaryCard({ icon: Icon, label, value }: SummaryCardProps) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-4 p-4 sm:p-5">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-semibold">{value}</p>
        </div>
        <div className="flex size-10 items-center justify-center rounded-md bg-secondary text-muted-foreground">
          <Icon className="size-5" />
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

function ContinueWatchingCard({ item }: { item: ContinueWatchingItem }) {
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
            <Button asChild className="w-full gap-2 sm:w-auto md:w-32">
              <Link href={`/shows/${item.tmdbId}`}>
                <Play className="size-4" />
                Continue
              </Link>
            </Button>
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
  const hasShows = data.summary.totalShows > 0;

  return (
    <div className="flex flex-col gap-8">
      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Library Summary</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Full library totals, including shows hidden by display preferences.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <SummaryCard icon={ListPlus} label="Total shows" value={data.summary.totalShows} />
          <SummaryCard icon={Play} label="Watching" value={data.summary.watchingCount} />
          <SummaryCard icon={ListChecks} label="Caught up" value={data.summary.caughtUpCount} />
          <SummaryCard icon={CheckCircle2} label="Completed" value={data.summary.completedCount} />
          <SummaryCard icon={Star} label="Watchlist" value={data.summary.watchlistCount} />
          <SummaryCard icon={CircleSlash} label="Dropped" value={data.summary.droppedCount} />
          <SummaryCard icon={Heart} label="Favourites" value={data.summary.favouriteCount} />
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Continue Watching</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Pick up from the next unwatched episode in your active shows.
          </p>
        </div>

        {data.continueWatching.length === 0 ? (
          <EmptyContinueWatchingState
            hasHiddenItems={data.hiddenContinueWatchingCount > 0}
            hasShows={hasShows}
          />
        ) : (
          <div className="grid gap-3">
            {data.continueWatching.map((item) => (
              <ContinueWatchingCard key={item.tmdbId} item={item} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

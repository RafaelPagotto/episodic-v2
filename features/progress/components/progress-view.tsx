import Image from "next/image";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ProgressBar } from "@/components/ui/progress-bar";
import type { UserPreferences } from "@/features/preferences/types";
import { filterShowsForPreferences, shouldFadeShowForPreferences } from "@/features/preferences/view-model";
import type { LibraryShowCard } from "@/features/library/types";
import { getProgressStatusLabel } from "@/features/progress/view-model";
import { getTmdbImageUrl } from "@/lib/tmdb/images";
import { cn } from "@/lib/utils";

type ProgressViewProps = {
  preferences: UserPreferences;
  shows: LibraryShowCard[];
};

function ProgressPoster({ show }: { show: LibraryShowCard }) {
  const posterUrl = getTmdbImageUrl(show.posterPath, "w185");

  if (!posterUrl) {
    return (
      <div className="flex aspect-[2/3] w-20 shrink-0 items-center justify-center rounded-md bg-secondary text-lg font-semibold text-muted-foreground">
        {show.title.charAt(0)}
      </div>
    );
  }

  return (
    <Image
      alt={`${show.title} poster`}
      className="aspect-[2/3] w-20 shrink-0 rounded-md object-cover"
      height={278}
      sizes="80px"
      src={posterUrl}
      width={185}
    />
  );
}

export function ProgressView({ preferences, shows }: ProgressViewProps) {
  const visibleShows = filterShowsForPreferences(shows, preferences).sort(
    (left, right) => right.progressPercentage - left.progressPercentage || left.title.localeCompare(right.title),
  );

  if (shows.length === 0) {
    return (
      <EmptyState
        action={
          <Button asChild>
            <Link href="/search">Search shows</Link>
          </Button>
        }
        description="Add shows to your library to start tracking progress."
        title="No progress yet"
      />
    );
  }

  if (visibleShows.length === 0) {
    return (
      <EmptyState
        description="Adjust your profile preferences to show hidden progress items."
        title="No shows match your preferences"
      />
    );
  }

  return (
    <div className="grid gap-3">
      {visibleShows.map((show) => (
        <Card
          key={show.tmdbId}
          className={cn("overflow-hidden", shouldFadeShowForPreferences(show, preferences) && "opacity-60")}
        >
          <CardContent className="flex gap-4 p-4 sm:p-5">
            <ProgressPoster show={show} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <h2 className="truncate text-base font-semibold">{show.title}</h2>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="rounded-full border px-2 py-0.5 text-xs font-medium text-muted-foreground">
                      {getProgressStatusLabel(show.displayStatus)}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {Math.max(show.totalEpisodeCount - show.watchedEpisodeCount, 0)} episodes remaining
                    </span>
                  </div>
                </div>
                <Button asChild className="w-full sm:w-auto md:w-32" variant="outline">
                  <Link href={`/shows/${show.tmdbId}`}>Details</Link>
                </Button>
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
      ))}
    </div>
  );
}

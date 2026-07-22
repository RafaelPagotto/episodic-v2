import { CheckCircle2, CircleSlash, Heart, ListChecks, ListPlus, Play, Star } from "lucide-react";
import type { ComponentType } from "react";

import { Card, CardContent } from "@/components/ui/card";
import type { DashboardSummary } from "@/features/dashboard";

type SummaryTileProps = {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: number;
};

type LibrarySummaryTilesProps = {
  summary: DashboardSummary;
};

function SummaryTile({ icon: Icon, label, value }: SummaryTileProps) {
  return (
    <Card className="flex h-full min-w-0 bg-card/80">
      <CardContent className="flex min-h-16 min-w-0 flex-1 items-center gap-3 p-3 pt-3 sm:p-3 sm:pt-3">
        <div
          aria-hidden="true"
          className="flex size-8 shrink-0 items-center justify-center rounded-md bg-secondary text-muted-foreground"
        >
          <Icon className="size-4" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-xs text-muted-foreground">{label}</p>
          <p className="mt-0.5 text-xl font-semibold leading-none">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export function LibrarySummaryTiles({ summary }: LibrarySummaryTilesProps) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-7">
      <SummaryTile icon={ListPlus} label="Total shows" value={summary.totalShows} />
      <SummaryTile icon={Play} label="Watching" value={summary.watchingCount} />
      <SummaryTile icon={ListChecks} label="Caught up" value={summary.caughtUpCount} />
      <SummaryTile icon={CheckCircle2} label="Completed" value={summary.completedCount} />
      <SummaryTile icon={Star} label="Watchlist" value={summary.watchlistCount} />
      <SummaryTile icon={CircleSlash} label="Dropped" value={summary.droppedCount} />
      <SummaryTile icon={Heart} label="Favourites" value={summary.favouriteCount} />
    </div>
  );
}

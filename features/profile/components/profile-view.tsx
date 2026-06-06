import { CheckCircle2, CircleSlash, Heart, ListChecks, ListPlus, Play, Star } from "lucide-react";
import type { ComponentType } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import type { ProfilePageData } from "../types";
import { DataControls } from "./data-controls";
import { PreferencesForm } from "./preferences-form";

type ProfileViewProps = {
  data: ProfilePageData;
};

type StatCardProps = {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: number;
};

function StatCard({ icon: Icon, label, value }: StatCardProps) {
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

export function ProfileView({ data }: ProfileViewProps) {
  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Signed in as</p>
          <p className="mt-1 break-all text-base font-medium">{data.email}</p>
        </CardContent>
      </Card>

      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Library Statistics</h2>
          <p className="mt-1 text-sm text-muted-foreground">Your current library counts by watch status.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <StatCard icon={ListPlus} label="Total shows" value={data.summary.totalShows} />
          <StatCard icon={Play} label="Watching" value={data.summary.watchingCount} />
          <StatCard icon={ListChecks} label="Caught up" value={data.summary.caughtUpCount} />
          <StatCard icon={CheckCircle2} label="Completed" value={data.summary.completedCount} />
          <StatCard icon={Star} label="Watchlist" value={data.summary.watchlistCount} />
          <StatCard icon={CircleSlash} label="Dropped" value={data.summary.droppedCount} />
          <StatCard icon={Heart} label="Favourites" value={data.summary.favouriteCount} />
        </div>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Preferences</CardTitle>
        </CardHeader>
        <CardContent>
          <PreferencesForm preferences={data.preferences} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Data Controls</CardTitle>
          <p className="text-sm text-muted-foreground">
            Export your data or perform account-level cleanup actions.
          </p>
        </CardHeader>
        <CardContent>
          <DataControls deleteConfirmationTarget={data.deleteConfirmationTarget} />
        </CardContent>
      </Card>
    </div>
  );
}

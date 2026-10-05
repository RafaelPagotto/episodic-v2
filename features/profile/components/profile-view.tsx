import { LibrarySummaryTiles } from "@/components/library-summary-tiles";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import type { ProfilePageData } from "../types";
import { DataControls } from "./data-controls";
import { PreferencesForm } from "./preferences-form";
import { TimeZoneForm } from "./timezone-form";

type ProfileViewProps = {
  data: ProfilePageData;
};

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
          <TimeZoneForm persistedTimeZone={data.persistedTimeZone} />
        </CardContent>
      </Card>

      <details className="group/stats rounded-lg border bg-card">
        <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 rounded-lg p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
          <h2 className="text-lg font-semibold tracking-tight">Library Statistics</h2>
          <ChevronDown aria-hidden="true" className="size-5 group-open/stats:hidden" />
          <ChevronUp aria-hidden="true" className="hidden size-5 group-open/stats:block" />
        </summary>
        <div className="p-4 pt-0"><LibrarySummaryTiles summary={data.summary} /></div>
      </details>

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

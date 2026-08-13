import { LibrarySummaryTiles } from "@/components/library-summary-tiles";
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

      <section className="space-y-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Library Statistics</h2>
          <p className="mt-1 text-sm text-muted-foreground">Your current library counts by watch status.</p>
        </div>
        <LibrarySummaryTiles summary={data.summary} />
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

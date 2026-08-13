import type { DashboardSummary } from "@/features/dashboard";
import type { UserPreferences } from "@/features/preferences";

export type ProfilePageData = {
  deleteConfirmationTarget: string;
  email: string;
  persistedTimeZone: string | null;
  preferences: UserPreferences;
  summary: DashboardSummary;
};

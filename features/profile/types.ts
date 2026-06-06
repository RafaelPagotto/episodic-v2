import type { DashboardSummary } from "@/features/dashboard";
import type { UserPreferences } from "@/features/preferences";

export type ProfilePageData = {
  deleteConfirmationTarget: string;
  email: string;
  preferences: UserPreferences;
  summary: DashboardSummary;
};

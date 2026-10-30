import * as React from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "../lib/supabase/types";

const mocks = vi.hoisted(() => ({
  preferences: vi.fn(), dates: vi.fn(), shows: vi.fn(), timezone: vi.fn(), summary: vi.fn(),
  user: vi.fn(), guest: vi.fn(), client: { auth: { getUser: vi.fn() } },
}));
vi.mock("@/lib/supabase/server", () => ({ createOptionalSupabaseServerClient: async () => mocks.client, createSupabaseServerClient: async () => mocks.client }));
vi.mock("@/features/preferences", () => ({ getUserPreferences: mocks.preferences, PreferencesDataError: class extends Error {} }));
vi.mock("@/features/preferences/defaults", async () => import("../features/preferences/defaults"));
vi.mock("@/lib/date-only", async () => import("../lib/date-only"));
vi.mock("@/features/dashboard", () => ({ getUserDashboardSummary: mocks.summary, DashboardDataError: class extends Error {} }));
vi.mock("../features/library/data", () => ({ getUserLibraryShows: mocks.shows, LibraryDataError: class extends Error {} }));
vi.mock("@/features/profile/timezone", () => ({ getUserDateOptions: mocks.dates, getPersistedUserTimeZone: mocks.timezone }));
vi.mock("../features/profile/timezone", () => ({ getPersistedUserTimeZone: mocks.timezone }));
vi.mock("@/features/auth/session", () => ({ requireCurrentUser: mocks.user }));
vi.mock("@/features/guest/server", () => ({ getGuestSession: mocks.guest }));
vi.mock("@/features/guest/components/guest-controls", () => ({ GuestControls: () => null }));
vi.mock("@/features/profile/components/timezone-initializer", () => ({ TimeZoneInitializer: () => null }));
vi.mock("@/components/app-shell", () => ({ AppShell: () => null }));
vi.mock("@/components/page-header", () => ({ PageHeader: () => null }));
vi.mock("@/components/ui/notice", () => ({ Notice: () => null }));
vi.mock("../features/library/components/library-view", () => ({ LibraryView: () => null }));

import { LibraryPageContent } from "../features/library/components/library-page";
import { getUserProfileData } from "../features/profile/data";
import ProtectedAppLayout from "../app/(app)/layout";
import { DEFAULT_USER_PREFERENCES } from "../features/preferences/defaults";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => { resolve = complete; });
  return { promise, resolve };
}
const dateOptions = { referenceDate: "2026-10-29", timeZone: "America/Sao_Paulo" };
beforeEach(() => {
  vi.resetAllMocks();
  (globalThis as typeof globalThis & { React: typeof React }).React = React;
  mocks.client.auth.getUser.mockResolvedValue({ data: { user: { id: "user", is_anonymous: false } } });
  mocks.user.mockResolvedValue({ id: "user", is_anonymous: true });
  mocks.preferences.mockResolvedValue(DEFAULT_USER_PREFERENCES);
  mocks.dates.mockResolvedValue(dateOptions);
  mocks.shows.mockResolvedValue([]);
  mocks.timezone.mockResolvedValue("America/Sao_Paulo");
  mocks.summary.mockResolvedValue({ totalShows: 0 });
  mocks.guest.mockResolvedValue({ seeded_at: "seed", expires_at: "2026-11-01T00:00:00Z" });
});

describe("page loading critical paths", () => {
  it("starts Library show reads without waiting for preferences", async () => {
    const preferences = deferred<typeof DEFAULT_USER_PREFERENCES>();
    mocks.preferences.mockReturnValue(preferences.promise);
    const pending = LibraryPageContent();
    await vi.waitFor(() => expect(mocks.shows).toHaveBeenCalledWith(mocks.client, "user", dateOptions));
    preferences.resolve(DEFAULT_USER_PREFERENCES);
    await expect(pending).resolves.toBeDefined();
  });
  it("still waits for verified auth and saved date options", async () => {
    const auth = deferred<{ data: { user: { id: string } } }>();
    const dates = deferred<typeof dateOptions>();
    mocks.client.auth.getUser.mockReturnValue(auth.promise);
    mocks.dates.mockReturnValue(dates.promise);
    const pending = LibraryPageContent();
    await vi.waitFor(() => expect(mocks.client.auth.getUser).toHaveBeenCalled());
    expect(mocks.preferences).not.toHaveBeenCalled();
    expect(mocks.shows).not.toHaveBeenCalled();
    auth.resolve({ data: { user: { id: "user" } } });
    await vi.waitFor(() => expect(mocks.dates).toHaveBeenCalled());
    expect(mocks.shows).not.toHaveBeenCalled();
    dates.resolve(dateOptions);
    await pending;
    expect(mocks.shows).toHaveBeenCalledWith(mocks.client, "user", dateOptions);
  });
  it("keeps concurrent Library read failures controlled", async () => {
    mocks.preferences.mockRejectedValue(new Error("private preference failure"));
    mocks.shows.mockRejectedValue(new Error("private show failure"));
    const result = await LibraryPageContent();
    expect(JSON.stringify(result)).not.toContain("private");
  });
  it("starts Profile summary as soon as timezone is ready, while preferences are pending", async () => {
    const preferences = deferred<typeof DEFAULT_USER_PREFERENCES>();
    mocks.preferences.mockReturnValue(preferences.promise);
    const pending = getUserProfileData(mocks.client as unknown as SupabaseClient<Database>, "user", "qa@example.test");
    await vi.waitFor(() => expect(mocks.summary).toHaveBeenCalledWith(mocks.client, "user", {
      referenceDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), timeZone: "America/Sao_Paulo",
    }));
    preferences.resolve(DEFAULT_USER_PREFERENCES);
    await expect(pending).resolves.toMatchObject({ preferences: DEFAULT_USER_PREFERENCES, persistedTimeZone: "America/Sao_Paulo", summary: { totalShows: 0 } });
  });
  it("preserves Profile's safe error when a concurrent summary read fails", async () => {
    mocks.summary.mockRejectedValue(new Error("private summary failure"));
    await expect(getUserProfileData(mocks.client as unknown as SupabaseClient<Database>, "user", "qa@example.test"))
      .rejects.toThrow("Unable to load your profile.");
  });
  it("loads guest session and timezone concurrently after the protected layout auth check", async () => {
    const auth = deferred<{ id: string; is_anonymous: boolean }>();
    const timezone = deferred<string>();
    mocks.user.mockReturnValue(auth.promise);
    mocks.timezone.mockReturnValue(timezone.promise);
    const pending = ProtectedAppLayout({ children: <p>Page</p> });
    expect(mocks.timezone).not.toHaveBeenCalled();
    expect(mocks.guest).not.toHaveBeenCalled();
    auth.resolve({ id: "user", is_anonymous: true });
    await vi.waitFor(() => expect(mocks.guest).toHaveBeenCalled());
    timezone.resolve("America/Sao_Paulo");
    await expect(pending).resolves.toBeDefined();
  });
  it("does not wait for a slow timezone read to reject a failed guest session lookup", async () => {
    mocks.timezone.mockReturnValue(new Promise(() => {}));
    mocks.guest.mockRejectedValue(new Error("Guest session unavailable"));
    await expect(ProtectedAppLayout({ children: <p>Page</p> })).rejects.toThrow("Guest session unavailable");
  });
});

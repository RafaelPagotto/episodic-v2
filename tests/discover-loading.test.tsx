import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DiscoverState } from "../features/discover/state";

const mocks = vi.hoisted(() => ({ query: "" }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(mocks.query), useRouter: () => ({}) }));
vi.mock("@/components/page-loading", async () => import("../components/page-loading"));
vi.mock("@/components/brand-logo", () => ({ BrandLogo: () => <span aria-hidden="true" data-brand-logo="/brand/episodic-logo.svg" /> }));
vi.mock("@/components/ui/action-feedback", () => ({ ActionFeedback: () => null, ACTION_FEEDBACK_AUTO_DISMISS_MS: 3000 }));
vi.mock("@/components/ui/button", () => ({ Button: () => null }));
vi.mock("@/components/ui/empty-state", () => ({ EmptyState: () => null }));
vi.mock("@/components/tmdb-attribution", () => ({ TmdbAttribution: () => null }));
vi.mock("@/features/preferences/view-model", () => ({ shouldFadeAddedForPreferences: () => false, shouldHideAddedForPreferences: () => false }));
vi.mock("@/features/search/actions", () => ({ addShowToLibraryAction: vi.fn() }));
vi.mock("@/lib/utils", () => ({ cn: (...values: unknown[]) => values.filter(Boolean).join(" ") }));
vi.mock("../features/discover/components/show-result-card", () => ({ ShowResultCard: () => null }));

import DiscoverLoading from "../app/(app)/discover/loading";
import DashboardLoading from "../app/(app)/dashboard/loading";
import LibraryLoading from "../app/(app)/library/loading";
import ProfileLoading from "../app/(app)/profile/loading";
import ProgressLoading from "../app/(app)/progress/loading";
import SearchLoading from "../app/(app)/search/loading";
import ShowLoading from "../app/(app)/shows/[tmdbId]/loading";
import { PageLoading } from "../components/page-loading";
import { DiscoverView } from "../features/discover/components/discover-view";
import { DEFAULT_USER_PREFERENCES } from "../features/preferences/defaults";
import { beginDiscoverVisit, clearDiscoverVisit, rememberListing } from "../features/discover/session";
import { discoverKey } from "../features/discover/state";
import { TMDB_ATTRIBUTION } from "../lib/tmdb/attribution";

const initialState: DiscoverState = { feed: "trending", page: 1, q: "", searchPage: 1 };
beforeEach(() => {
  mocks.query = "";
  clearDiscoverVisit();
  (globalThis as typeof globalThis & { React: typeof React }).React = React;
});
afterEach(() => vi.useRealTimers());

function renderLoading(demo = false, accountScope = "loading-test") {
  return renderToStaticMarkup(<DiscoverView accountScope={accountScope} demo={demo} initialState={initialState}
    initialListing={new Promise(() => {})} initialAddedShowIds={[]} preferences={DEFAULT_USER_PREFERENCES} />);
}

describe("Discover loading presentation", () => {
  it("uses the same route loading component as the other pages", () => {
    for (const loading of [DiscoverLoading, DashboardLoading, LibraryLoading, ProfileLoading, ProgressLoading, SearchLoading, ShowLoading]) {
      expect(loading().type).toBe(PageLoading);
    }
  });
  it("renders the shared loader synchronously without a dwell or animation timer", () => {
    vi.useFakeTimers();
    const html = renderToStaticMarkup(<PageLoading />);
    expect(html).toContain("Loading");
    expect(vi.getTimerCount()).toBe(0);
    expect(html).not.toMatch(/animate-|transition-|duration-/);
  });
  it("renders a ready visit-cache hit on the first render, without waiting for effects", () => {
    beginDiscoverVisit("loading-test");
    mocks.query = "feed=popular";
    rememberListing(discoverKey({ ...initialState, feed: "popular" }, false), {
      attribution: TMDB_ATTRIBUTION, page: 1, results: [], totalPages: 1, totalResults: 0,
    });
    const html = renderLoading();
    expect(html).toContain("0 shows displayed. Page 1.");
    expect(html).toContain('aria-busy="false"');
    expect(html).not.toContain("Loading");
  });
  it.each(["different account", "guest"])("does not reveal a cached listing to a %s", (mode) => {
    beginDiscoverVisit("loading-test");
    const demo = mode === "guest";
    mocks.query = demo ? "q=dark" : "feed=popular";
    rememberListing(discoverKey(demo ? { ...initialState, q: "dark" } : { ...initialState, feed: "popular" }, demo), {
      attribution: TMDB_ATTRIBUTION, page: 1, results: [], totalPages: 1, totalResults: 0,
    });
    const html = renderLoading(demo, demo ? "loading-test" : "different-account");
    expect(html).toContain("Loading");
    expect(html).not.toContain("0 shows displayed.");
  });
  it("still loads again instead of rendering an expired browser snapshot", () => {
    beginDiscoverVisit("loading-test");
    mocks.query = "feed=popular";
    rememberListing(discoverKey({ ...initialState, feed: "popular" }, false), {
      attribution: TMDB_ATTRIBUTION, page: 1, results: [], totalPages: 1, totalResults: 0,
    }, Date.now() - 300_000);
    expect(renderLoading()).toContain("Loading");
  });
  it.each(["", "feed=popular", "q=dark&searchPage=2"])("uses one shared branded loader without skeletons for %s", (query) => {
    mocks.query = query;
    const html = renderLoading();
    expect(html).toContain("/brand/episodic-logo.svg");
    expect(html).toContain("Loading");
    expect(html.match(/role="status"/g)).toHaveLength(1);
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('aria-label="Search TV shows"');
    expect(html).not.toContain("Loading shows...");
    expect(html).not.toContain("aspect-[2/3]");
    expect(html).not.toContain("animate-pulse");
    if (query) expect(html).toContain('aria-busy="true"');
  });
});

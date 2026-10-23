import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: vi.fn(), ids: vi.fn(), prefs: vi.fn(), guest: vi.fn(), listing: vi.fn(), search: vi.fn(), redirect: vi.fn((href: string) => { throw new Error(`REDIRECT:${href}`); }) }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/features/auth/session", () => ({ requireCurrentUser: mocks.user }));
vi.mock("@/features/discover/components/discover-view", () => ({ DiscoverView: () => null }));
vi.mock("@/features/discover/state", async () => import("../features/discover/state"));
vi.mock("@/features/discover/server", () => ({ loadDiscoverListing: mocks.listing, loadDiscoverSearch: mocks.search }));
vi.mock("@/features/guest/server", () => ({ getGuestSession: mocks.guest }));
vi.mock("@/features/preferences/data", () => ({ getUserPreferences: mocks.prefs }));
vi.mock("@/features/search/data", () => ({ getUserLibraryShowIds: mocks.ids }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => ({}) }));
import DiscoverPage from "../app/(app)/discover/page";
import SearchPage from "../app/(app)/search/page";
beforeEach(() => {
  vi.clearAllMocks(); (globalThis as typeof globalThis & { React: typeof React }).React = React;
  mocks.user.mockResolvedValue({ id: "trusted-user", is_anonymous: false });
  mocks.ids.mockResolvedValue([1]); mocks.prefs.mockResolvedValue({}); mocks.guest.mockResolvedValue({ seeded_at: "seed-1" });
  mocks.listing.mockResolvedValue({ data: { results: [] } }); mocks.search.mockResolvedValue({ data: { results: [] } });
});
describe("Discover page integration", () => {
  it("streams the initial public listing separately without awaiting cold upstream", async () => {
    mocks.listing.mockReturnValue(new Promise(() => {}));
    const tree = await DiscoverPage({ searchParams: Promise.resolve({ feed: "popular", page: "3" }) });
    expect(tree.props).toMatchObject({ initialState: { feed: "popular", page: 3 }, initialAddedShowIds: [1], demo: false });
    expect(tree.props.initialListing).toBeInstanceOf(Promise);
    expect(mocks.listing).toHaveBeenCalledWith(expect.objectContaining({ id: "trusted-user" }), "popular", 3);
    expect(mocks.search).not.toHaveBeenCalled();
  });
  it("uses the same server search flow and keeps independent remembered browse state", async () => {
    const tree = await DiscoverPage({ searchParams: Promise.resolve({ feed: "popular", page: "3", q: "dark", searchPage: "2" }) });
    expect(tree.props.initialState).toEqual({ feed: "popular", page: 3, q: "dark", searchPage: 2 });
    expect(mocks.search).toHaveBeenCalledWith(expect.anything(), "dark", 2); expect(mocks.listing).not.toHaveBeenCalled();
  });
  it("uses demo-only data with reset-scoped visit identity", async () => {
    mocks.user.mockResolvedValue({ id: "guest-user", is_anonymous: true });
    const tree = await DiscoverPage({ searchParams: Promise.resolve({}) });
    expect(tree.props).toMatchObject({ accountScope: "guest-user:seed-1", demo: true });
    expect(mocks.listing).toHaveBeenCalledWith(expect.objectContaining({ is_anonymous: true }), "demo", 1);
  });
  it("fails closed on membership errors rather than falsely offering every show as unadded", async () => {
    mocks.ids.mockRejectedValue(new Error("private"));
    const tree = await DiscoverPage({ searchParams: Promise.resolve({}) });
    expect(tree.type).toBe("section"); expect(mocks.listing).not.toHaveBeenCalled(); expect(mocks.search).not.toHaveBeenCalled();
  });
  it("normalizes invalid URLs and guest global-feed URLs", async () => {
    await expect(DiscoverPage({ searchParams: Promise.resolve({ page: "11" }) })).rejects.toThrow("REDIRECT:/discover");
    mocks.user.mockResolvedValue({ id: "guest-user", is_anonymous: true });
    await expect(DiscoverPage({ searchParams: Promise.resolve({ feed: "popular", page: "3", q: "dark", searchPage: "2" }) })).rejects.toThrow("REDIRECT:/discover?q=dark");
    expect(mocks.listing).not.toHaveBeenCalled();
  });
  it("redirects legacy search while retaining query parameters", async () => {
    await expect(SearchPage({ searchParams: Promise.resolve({ q: "Dark", feed: "popular", source: ["one", "two"] }) })).rejects.toThrow("REDIRECT:/discover?q=Dark&feed=popular&source=one&source=two");
  });
});

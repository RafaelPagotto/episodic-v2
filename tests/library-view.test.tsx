import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LibraryView } from "../features/library/components/library-view";
import type { LibraryShowCard } from "../features/library/types";
import { DEFAULT_USER_PREFERENCES } from "../features/preferences/defaults";

const hooks = vi.hoisted(() => ({
  index: 0,
  states: [] as unknown[],
  mounted: false,
  effects: [] as Array<() => void>,
}));
const navigation = vi.hoisted(() => ({ href: "http://localhost/library" }));
const push = vi.hoisted(() => vi.fn());
const pushState = vi.hoisted(() => vi.fn());
const replaceState = vi.hoisted(() => vi.fn());
const favourite = vi.hoisted(() => vi.fn());
const drop = vi.hoisted(() => vi.fn());
const remove = vi.hoisted(() => vi.fn());
const markWatched = vi.hoisted(() => vi.fn());

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return {
    ...actual,
    useEffect: (effect: () => void) => {
      if (!hooks.mounted) hooks.effects.push(effect);
    },
    useMemo: (compute: () => unknown) => compute(),
    useState: (initial: unknown) => {
      const index = hooks.index++;
      if (!(index in hooks.states)) hooks.states[index] = initial;
      return [hooks.states[index], (next: unknown) => {
        hooks.states[index] = typeof next === "function"
          ? (next as (current: unknown) => unknown)(hooks.states[index]) : next;
      }];
    },
    useTransition: () => [false, (callback: () => void) => callback()],
  };
});
vi.mock("next/navigation", () => ({
  usePathname: () => new URL(navigation.href).pathname,
  useSearchParams: () => new URL(navigation.href).searchParams,
  useRouter: () => ({ push }),
}));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("next/link", () => ({ default: () => null }));
vi.mock("@/components/ui/button", () => ({ Button: () => null }));
vi.mock("@/components/ui/card", () => ({ Card: () => null, CardContent: () => null }));
vi.mock("@/components/ui/action-feedback", () => ({ ACTION_FEEDBACK_AUTO_DISMISS_MS: 3000, ActionFeedback: () => null }));
vi.mock("@/components/ui/empty-state", () => ({ EmptyState: () => null }));
vi.mock("@/components/ui/notice", () => ({ Notice: () => null }));
vi.mock("@/components/ui/progress-bar", () => ({ ProgressBar: () => null }));
vi.mock("@/features/preferences/view-model", async () =>
  vi.importActual("../features/preferences/view-model"),
);
vi.mock("@/features/shows", () => ({ getShowDetailHref: (tmdbId: number) => `/shows/${tmdbId}` }));
vi.mock("@/features/shows/actions", () => ({ markShowWatchedAction: markWatched }));
vi.mock("../features/library/actions", () => ({
  updateShowFavouriteAction: favourite,
  updateShowDroppedAction: drop,
  removeShowFromLibraryAction: remove,
}));
vi.mock("@/lib/tmdb/images", () => ({ getTmdbImageUrl: () => null }));
vi.mock("@/lib/utils", async () => vi.importActual("../lib/utils"));

function show(tmdbId: number, title: string, overrides: Partial<LibraryShowCard> = {}): LibraryShowCard {
  return {
    addedAt: "2026-05-01T00:00:00.000Z", displayStatus: "watchlist", favourite: false,
    firstAirDate: "2020-01-01", posterPath: null, progressPercentage: 0, status: "watchlist",
    title, tmdbId, tmdbStatus: "Returning Series", totalEpisodeCount: 10, watchedEpisodeCount: 0,
    ...overrides,
  };
}
const shows = [
  show(10, "Zulu"),
  show(11, "Alpha", { addedAt: "2026-05-02T00:00:00.000Z" }),
  show(20, "Active", { displayStatus: "watching", status: "watching", watchedEpisodeCount: 1 }),
];

function elements(node: React.ReactNode): React.ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!React.isValidElement(node)) return [];
  const element = node as React.ReactElement<Record<string, unknown>>;
  return [element, ...elements(element.props.children as React.ReactNode)];
}
function render() {
  hooks.index = 0;
  const tree = LibraryView({ initialShows: shows, loadError: "", preferences: DEFAULT_USER_PREFERENCES });
  for (const effect of hooks.effects.splice(0)) effect();
  hooks.mounted = true;
  return tree;
}
function titles(tree: React.ReactNode) {
  return elements(tree).filter((element) =>
    element.props.href && typeof element.props.children === "string"
    && String(element.props["aria-label"]).startsWith("View details for "),
  ).map((element) => element.props.children);
}
function button(tree: React.ReactNode, label: string) {
  const match = elements(tree).find((element) => typeof element.props.onClick === "function"
    && (React.Children.toArray(element.props.children as React.ReactNode).includes(label)
      || element.props["aria-label"] === label));
  if (!match) throw new Error(`Missing button ${label}`);
  return match;
}
function click(tree: React.ReactNode, label: string) {
  (button(tree, label).props.onClick as () => void)();
}
function visit(href: string) {
  navigation.href = new URL(href, "http://localhost").href;
}

describe("Library URL filters", () => {
  beforeEach(() => {
    (globalThis as typeof globalThis & { React: typeof React }).React = React;
    hooks.index = 0;
    hooks.states = [];
    hooks.mounted = false;
    hooks.effects = [];
    visit("/library");
    push.mockReset();
    push.mockImplementation(() => { throw new Error("Filters must not trigger a server navigation"); });
    pushState.mockReset();
    pushState.mockImplementation(() => { throw new Error("Filters must not add browser history entries"); });
    replaceState.mockReset();
    replaceState.mockImplementation((_data: unknown, _unused: string, href: string) => visit(href));
    for (const action of [favourite, drop, remove, markWatched]) action.mockReset();
    vi.stubGlobal("window", {
      location: { get hash() { return new URL(navigation.href).hash; } },
      history: { pushState, replaceState },
      localStorage: { getItem: vi.fn(() => null), setItem: vi.fn() },
      confirm: vi.fn(() => true),
    });
  });
  afterEach(() => {
    expect(push).not.toHaveBeenCalled();
    expect(pushState).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it.each(["/library", "/library?filter=invalid", "/library?filter="])(
    "opens %s with All active and all shows visible", (href) => {
      visit(href);
      const tree = render();
      expect(button(tree, "All").props["aria-pressed"]).toBe(true);
      expect(titles(tree)).toEqual(["Alpha", "Active", "Zulu"]);
      expect(replaceState).not.toHaveBeenCalled();
    },
  );

  it("opens the Dashboard destination with Watchlist active on the first render", () => {
    visit("/library?filter=watchlist");
    const tree = render();
    expect(button(tree, "Watchlist").props["aria-pressed"]).toBe(true);
    expect(button(tree, "All").props["aria-pressed"]).toBe(false);
    expect(titles(tree)).toEqual(["Alpha", "Zulu"]);
    expect(elements(tree).filter((element) => element.props.href).map((element) => element.props.href))
      .toEqual(["/shows/11", "/shows/10"]);
  });

  it("filters locally without server navigation, preserving query parameters and the fragment", () => {
    visit("/library?filter=watchlist&tag=a&tag=b#saved");
    click(render(), "Watching");
    expect(replaceState).toHaveBeenCalledWith(null, "", "/library?filter=watching&tag=a&tag=b#saved");
    expect(button(render(), "Watching").props["aria-pressed"]).toBe(true);
    expect(titles(render())).toEqual(["Active"]);

    click(render(), "All");
    expect(replaceState).toHaveBeenLastCalledWith(null, "", "/library?tag=a&tag=b#saved");
    expect(titles(render())).toHaveLength(3);
    for (const action of [favourite, drop, remove, markWatched]) expect(action).not.toHaveBeenCalled();
  });

  it("adds a filter from the plain Library route and removes it when selecting All", () => {
    click(render(), "Watchlist");
    expect(replaceState).toHaveBeenLastCalledWith(null, "", "/library?filter=watchlist");
    click(render(), "All");
    expect(replaceState).toHaveBeenLastCalledWith(null, "", "/library");
    click(render(), "All");
    expect(replaceState).toHaveBeenCalledTimes(2);
  });

  it("replaces filters in the current entry so Back returns to the previous page", () => {
    const history = ["/dashboard", "/library?filter=watchlist"];
    let index = 1;
    visit(history[index]!);
    replaceState.mockImplementation((_data: unknown, _unused: string, href: string) => {
      history[index] = href;
      visit(href);
    });
    for (const filter of ["Watching", "All", "Completed", "Watchlist", "Watching"]) {
      click(render(), filter);
    }
    expect(replaceState).toHaveBeenCalledTimes(5);
    expect(history).toEqual(["/dashboard", "/library?filter=watching"]);
    // Simulate Back followed by Forward on the resulting history entries.
    visit(history[--index]!);
    expect(new URL(navigation.href).pathname).toBe("/dashboard");
    visit(history[++index]!);
    expect(button(render(), "Watching").props["aria-pressed"]).toBe(true);
    expect(titles(render())).toEqual(["Active"]);
  });

  it("restores the current filter from the URL after a fresh mount", () => {
    visit("/library?filter=watchlist");
    click(render(), "Watching");
    hooks.states = [];
    hooks.mounted = false;
    expect(button(render(), "Watching").props["aria-pressed"]).toBe(true);
    expect(titles(render())).toEqual(["Active"]);
  });

  it("ignores a legacy list preference while preserving saved sorting and URL filters", () => {
    visit("/library?filter=watchlist");
    const savedPreferences: Record<string, string> = {
      "episodic.library.viewMode": "list", "episodic.library.sort": "title",
      "episodic.library.sortDirection": "desc",
    };
    window.localStorage.getItem = vi.fn((key: string) => savedPreferences[key] ?? null);
    const initialTree = render();
    expect(titles(initialTree)).toEqual(["Alpha", "Zulu"]);
    expect(button(initialTree, "Mark all main episodes of Alpha watched").props.size).toBe("icon");
    expect(titles(render())).toEqual(["Zulu", "Alpha"]);
    expect(button(render(), "Mark all main episodes of Alpha watched").props.size).toBe("icon");
    expect(elements(render()).some((element) => element.props["aria-label"] === "Library view mode")).toBe(false);
    expect(() => button(render(), "Grid")).toThrow("Missing button Grid");
    expect(() => button(render(), "List")).toThrow("Missing button List");
    expect(window.localStorage.getItem).not.toHaveBeenCalledWith("episodic.library.viewMode");
    click(render(), "All");
    expect(titles(render())).toEqual(["Zulu", "Alpha", "Active"]);
    expect(button(render(), "Mark all main episodes of Active watched").props.size).toBe("icon");
    expect(elements(render()).find((element) => element.type === "select")?.props.value).toBe("title:desc");
    expect(window.localStorage.setItem).not.toHaveBeenCalled();
  });

  it("persists new sorting choices and restores them after remount without changing the filter URL", () => {
    visit("/library?filter=watchlist");
    const savedPreferences: Record<string, string> = { "episodic.library.viewMode": "list" };
    window.localStorage.getItem = vi.fn((key: string) => savedPreferences[key] ?? null);
    window.localStorage.setItem = vi.fn((key: string, value: string) => { savedPreferences[key] = value; });
    render();
    const select = elements(render()).find((element) => element.type === "select")!;
    (select.props.onChange as (event: { target: { value: string } }) => void)({ target: { value: "title:desc" } });
    expect(titles(render())).toEqual(["Zulu", "Alpha"]);
    expect(vi.mocked(window.localStorage.setItem).mock.calls).toEqual([
      ["episodic.library.sort", "title"], ["episodic.library.sortDirection", "desc"],
    ]);
    hooks.states = [];
    hooks.mounted = false;
    render();
    expect(titles(render())).toEqual(["Zulu", "Alpha"]);
    expect(button(render(), "Watchlist").props["aria-pressed"]).toBe(true);
    expect(button(render(), "Mark all main episodes of Alpha watched").props.size).toBe("icon");
    expect(replaceState).not.toHaveBeenCalled();
  });

  it("keeps favourite actions working without changing the current filter URL", async () => {
    visit("/library?filter=watchlist");
    favourite.mockResolvedValue({ status: "success", message: "Updated." });
    click(render(), "Add Alpha to favourites");
    expect(favourite).toHaveBeenCalledWith({ favourite: true, tmdbId: 11 });
    await Promise.resolve();
    expect(button(render(), "Remove Alpha from favourites").props["aria-pressed"]).toBe(true);
    expect(titles(render())).toEqual(["Alpha", "Zulu"]);
    expect(replaceState).not.toHaveBeenCalled();
  });

  it("keeps confirmation before removing a show from the library", () => {
    window.confirm = vi.fn(() => false);
    click(render(), "Remove Alpha from library");
    expect(window.confirm).toHaveBeenCalledWith(
      "Remove Alpha from your library?\n\nThis permanently deletes all your watched progress for this show, including specials. If you add it again, every episode will be unwatched.",
    );
    expect(remove).not.toHaveBeenCalled();
    expect(titles(render())).toContain("Alpha");
  });

  it.each([
    { label: "Mark all main episodes of Alpha watched", action: markWatched, input: 11 },
    { label: "Drop Alpha", action: drop, input: { dropped: true, tmdbId: 11 } },
    { label: "Remove Alpha from library", action: remove, input: 11 },
  ])("keeps $label working and updates the filtered results", async ({ label, action, input }) => {
    visit("/library?filter=watchlist");
    action.mockResolvedValue({ status: "success", message: "Updated." });
    click(render(), label);
    expect(action).toHaveBeenCalledWith(input);
    await Promise.resolve();
    expect(titles(render())).toEqual(["Zulu"]);
    expect(button(render(), "Watchlist").props["aria-pressed"]).toBe(true);
    expect(replaceState).not.toHaveBeenCalled();
  });
});

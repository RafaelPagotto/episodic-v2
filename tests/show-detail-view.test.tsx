import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ShowDetailView } from "../features/shows/components/show-detail-view";
import type { ShowDetail, ShowDetailEpisode, ShowDetailSeason } from "../features/shows";

const hookState = vi.hoisted(() => ({
  stateIndex: 0,
  states: [] as unknown[],
  refIndex: 0,
  refs: [] as Array<{ current: unknown }>,
  effectIndex: 0,
  effectDeps: [] as Array<readonly unknown[] | undefined>,
  effectCleanups: [] as Array<(() => void) | undefined>,
  pendingEffects: [] as Array<{ index: number; effect: () => void | (() => void) }>,
  transitionPending: false,
}));
const routerRefreshMock = vi.hoisted(() => vi.fn());
const refreshShowMetadataActionMock = vi.hoisted(() => vi.fn());
const setEpisodeWatchedActionMock = vi.hoisted(() => vi.fn());
const resetShowProgressActionMock = vi.hoisted(() => vi.fn());
const setSeasonWatchedActionMock = vi.hoisted(() => vi.fn());

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");

  return {
    ...actual,
    useEffect: vi.fn((effect: () => void | (() => void), deps?: readonly unknown[]) => {
      const index = hookState.effectIndex++;
      const previous = hookState.effectDeps[index];
      if (!previous || !deps || deps.some((value, position) => !Object.is(value, previous[position]))) {
        hookState.effectCleanups[index]?.();
        hookState.effectDeps[index] = deps;
        hookState.pendingEffects.push({ index, effect });
      }
    }),
    useRef: vi.fn((initialValue: unknown) => {
      const refIndex = hookState.refIndex;
      hookState.refIndex += 1;
      if (!hookState.refs[refIndex]) {
        hookState.refs[refIndex] = { current: initialValue };
      }
      return hookState.refs[refIndex];
    }),
    useState: vi.fn((initialValue: unknown) => {
      const stateIndex = hookState.stateIndex;
      hookState.stateIndex += 1;

      if (hookState.states[stateIndex] === undefined) {
        hookState.states[stateIndex] =
          typeof initialValue === "function" ? (initialValue as () => unknown)() : initialValue;
      }

      const setState = vi.fn((nextValue: unknown) => {
        hookState.states[stateIndex] =
          typeof nextValue === "function"
            ? (nextValue as (currentValue: unknown) => unknown)(hookState.states[stateIndex])
            : nextValue;
      });

      return [hookState.states[stateIndex], setState];
    }),
    useTransition: vi.fn(() => [
      hookState.transitionPending,
      (callback: () => void) => {
        callback();
      },
    ]),
  };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: routerRefreshMock,
  }),
}));

vi.mock("next/image", () => ({
  default: function ImageMock() {
    return null;
  },
}));

vi.mock("@/components/ui/button", () => ({
  Button: function ButtonMock() {
    return null;
  },
}));

vi.mock("@/components/ui/action-feedback", () => ({
  ACTION_FEEDBACK_AUTO_DISMISS_MS: 5_000,
  ActionFeedback: function ActionFeedbackMock() {
    return null;
  },
}));

vi.mock("@/components/ui/card", () => ({
  Card: function CardMock({ children }: { children?: React.ReactNode }) {
    return <div>{children}</div>;
  },
  CardContent: function CardContentMock({ children }: { children?: React.ReactNode }) {
    return <div>{children}</div>;
  },
  CardHeader: function CardHeaderMock({ children }: { children?: React.ReactNode }) {
    return <div>{children}</div>;
  },
  CardTitle: function CardTitleMock({ children }: { children?: React.ReactNode }) {
    return <div>{children}</div>;
  },
}));

vi.mock("@/components/ui/empty-state", () => ({
  EmptyState: function EmptyStateMock() {
    return null;
  },
}));

vi.mock("@/components/ui/notice", () => ({
  Notice: function NoticeMock() {
    return null;
  },
}));

vi.mock("@/components/ui/progress-bar", () => ({
  ProgressBar: function ProgressBarMock() {
    return null;
  },
}));

vi.mock("@/components/tmdb-attribution", () => ({
  TmdbAttribution: function TmdbAttributionMock() {
    return null;
  },
}));

vi.mock("@/features/library/actions", () => ({
  updateShowDroppedAction: vi.fn(),
  updateShowFavouriteAction: vi.fn(),
}));

vi.mock("../features/shows/actions", () => ({
  markShowWatchedAction: vi.fn(),
  refreshShowMetadataAction: refreshShowMetadataActionMock,
  resetShowProgressAction: resetShowProgressActionMock,
  setEpisodeWatchedAction: setEpisodeWatchedActionMock,
  setSeasonWatchedAction: setSeasonWatchedActionMock,
}));

vi.mock("@/lib/tmdb/images", () => ({
  getTmdbImageUrl: vi.fn(() => null),
}));

vi.mock("@/lib/utils", () => ({
  cn: (...values: unknown[]) => values.filter(Boolean).join(" "),
}));

function episode(
  seasonNumber: number,
  episodeNumber: number,
  overrides: Partial<ShowDetailEpisode> = {},
): ShowDetailEpisode {
  return {
    airDate: "2026-01-01",
    episodeNumber,
    overview: null,
    runtimeMinutes: 42,
    seasonNumber,
    stillPath: null,
    title: `S${seasonNumber}E${episodeNumber}`,
    watched: false,
    ...overrides,
  };
}

function season(
  seasonNumber: number,
  episodes: ShowDetailEpisode[],
  overrides: Partial<ShowDetailSeason> = {},
): ShowDetailSeason {
  return {
    airDate: "2026-01-01",
    episodeCount: episodes.length,
    episodes,
    name: `Season ${seasonNumber}`,
    overview: null,
    posterPath: null,
    progress: {
      displayStatus: "watchlist",
      progressPercentage: 0,
      status: "watchlist",
      totalEpisodeCount: episodes.length,
      watchedEpisodeCount: episodes.filter((seasonEpisode) => seasonEpisode.watched).length,
    },
    seasonNumber,
    ...overrides,
  };
}

function showDetail(overrides: Partial<ShowDetail> = {}): ShowDetail {
  return {
    backdropPath: null,
    favourite: false,
    firstAirDate: "2021-11-06",
    lastSyncedAt: "2026-01-02T00:00:00.000Z",
    overview: "A test show.",
    posterPath: null,
    progress: {
      displayStatus: "watching",
      progressPercentage: 50,
      status: "watching",
      totalEpisodeCount: 2,
      watchedEpisodeCount: 1,
    },
    seasons: [season(1, [episode(1, 1, { watched: true }), episode(1, 2)])],
    title: "Arcane",
    tmdbId: 100,
    tmdbStatus: "Returning Series",
    ...overrides,
  };
}

function renderShowDetail(
  show: ShowDetail = showDetail(),
  timeZone = "UTC",
  referenceDate?: string,
) {
  hookState.stateIndex = 0;
  hookState.refIndex = 0;
  hookState.effectIndex = 0;
  const tree = ShowDetailView({ referenceDate, show, timeZone });
  const effects = hookState.pendingEffects.splice(0);
  effects.forEach(({ index, effect }) => {
    const cleanup = effect();
    hookState.effectCleanups[index] = typeof cleanup === "function" ? cleanup : undefined;
  });
  return tree;
}

function getText(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") {
    return "";
  }

  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }

  if (Array.isArray(node)) {
    return node.map(getText).join("");
  }

  if (React.isValidElement(node)) {
    return getText((node as React.ReactElement<{ children?: React.ReactNode }>).props.children);
  }

  return "";
}

function findElements(
  node: React.ReactNode,
  predicate: (element: React.ReactElement<Record<string, unknown>>) => boolean,
): React.ReactElement<Record<string, unknown>>[] {
  if (!React.isValidElement(node)) {
    if (Array.isArray(node)) {
      return node.flatMap((child) => findElements(child, predicate));
    }

    return [];
  }

  const element = node as React.ReactElement<Record<string, unknown>>;
  const children = React.Children.toArray(element.props.children as React.ReactNode);
  const childMatches = children.flatMap((child) => findElements(child, predicate));
  const elementMatches = predicate(element);
  const renderedMatches = !elementMatches && typeof element.type === "function"
    ? findElements(
        (element.type as (props: Record<string, unknown>) => React.ReactNode)(element.props),
        predicate,
      )
    : [];

  return elementMatches ? [element, ...childMatches] : [...childMatches, ...renderedMatches];
}

function findButton(text: string, tree: React.ReactNode) {
  const button = findElements(
    tree,
    (element) =>
      typeof element.props.onClick === "function"
      && (element.props.title === text || getText(element.props.children as React.ReactNode).includes(text)),
  )[0];

  if (!button) {
    throw new Error(`Button not found: ${text}`);
  }

  return button;
}

function findEpisodeButton(text: string, tree: React.ReactNode, title?: string) {
  const button = findElements(
    tree,
    (element) =>
      typeof element.props.onClick === "function"
      && typeof element.props.className === "string"
      && element.props.className.includes("md:w-36")
      && getText(element.props.children as React.ReactNode).includes(text)
      && (title === undefined || element.props.title === title),
  )[0];

  if (!button) {
    throw new Error(`Episode button not found: ${text}`);
  }

  return button;
}

function episodeButtons(tree: React.ReactNode) {
  return findElements(
    tree,
    (element) => typeof element.props.onClick === "function"
      && typeof element.props.className === "string"
      && element.props.className.includes("md:w-36"),
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => { resolve = complete; });
  return { promise, resolve };
}

function hasText(text: string | RegExp, tree: React.ReactNode) {
  const fullText = getText(tree);

  return typeof text === "string" ? fullText.includes(text) : text.test(fullText);
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}

describe("ShowDetailView refresh metadata UI", () => {
  afterEach(() => vi.unstubAllGlobals());
  beforeEach(() => {
    (globalThis as typeof globalThis & { React: typeof React }).React = React;
    hookState.stateIndex = 0;
    hookState.states = [];
    hookState.refIndex = 0;
    hookState.refs = [];
    hookState.effectIndex = 0;
    hookState.effectDeps = [];
    hookState.effectCleanups = [];
    hookState.pendingEffects = [];
    hookState.transitionPending = false;
    routerRefreshMock.mockReset();
    refreshShowMetadataActionMock.mockReset();
    setEpisodeWatchedActionMock.mockReset();
    resetShowProgressActionMock.mockReset();
    setSeasonWatchedActionMock.mockReset();
    refreshShowMetadataActionMock.mockResolvedValue({
      message: "Refreshed metadata for Arcane.",
      status: "success",
    });
    setEpisodeWatchedActionMock.mockResolvedValue({
      message: "Episode updated.",
      status: "success",
    });
  });

  it("renders all header actions as icon buttons with accessible labels and hover hints", () => {
    const tree = renderShowDetail();

    const actions = [
      ["Favourite", "Add Arcane to favourites"],
      ["Drop", "Drop Arcane"],
      ["Mark watched", "Mark all main episodes of Arcane watched"],
      ["Reset", "Reset all watched progress for Arcane"],
      ["Refresh metadata", "Refresh metadata for Arcane"],
    ];

    for (const [title, label] of actions) {
      const button = findButton(title, tree);
      expect(button.props["aria-label"]).toBe(label);
      expect(button.props.size).toBe("icon");
      expect(getText(button.props.children as React.ReactNode)).toBe("");
    }
  });

  it("calls refreshShowMetadataAction and refreshes the router after success", async () => {
    const tree = renderShowDetail();
    const button = findButton("Refresh metadata", tree);

    (button.props.onClick as () => void)();
    await flushPromises();

    expect(refreshShowMetadataActionMock).toHaveBeenCalledWith(100);
    expect(routerRefreshMock).toHaveBeenCalledTimes(1);
  });

  it("shows a pending Refresh metadata state", () => {
    hookState.states = [null, "show:refresh"];
    const tree = renderShowDetail();
    const button = findButton("Refreshing", tree);

    expect(button.props.disabled).toBe(true);
    expect(button.props["aria-busy"]).toBe(true);
    expect(button.props["aria-label"]).toBe("Refresh metadata for Arcane");
  });

  it("shows safe success and error feedback", () => {
    hookState.states = [{ message: "Refreshed metadata for Arcane.", status: "success" }, null];
    expect(hasText("Refreshed metadata for Arcane.", renderShowDetail())).toBe(true);

    hookState.states = [{ message: "Unable to refresh metadata right now.", status: "error" }, null];
    expect(hasText("Unable to refresh metadata right now.", renderShowDetail())).toBe(true);
    expect(hasText("secret", renderShowDetail())).toBe(false);
  });

  it("displays the metadata last refreshed date", () => {
    const tree = renderShowDetail();

    expect(hasText(/Metadata last refreshed .*2026/, tree)).toBe(true);
  });

  it("preserves episode, season, and show calendar dates in a negative-offset timezone", () => {
    const show = showDetail({
      firstAirDate: "2026-07-21",
      lastSyncedAt: "2026-07-19T02:30:00.000Z",
      seasons: [
        season(1, [episode(1, 1, { airDate: "2026-07-19" })], { airDate: "2026-07-20" }),
      ],
    });
    const markup = renderToStaticMarkup(renderShowDetail(show, "America/Sao_Paulo"));

    expect(markup).toContain("Jul 19, 2026");
    expect(markup).toContain("Jul 20, 2026");
    expect(markup).toContain("Jul 21, 2026");
    expect(markup).toContain("Metadata last refreshed Jul 18, 2026");
  });

  it("disables an unwatched future episode using the provided local reference date", async () => {
    const show = showDetail({
      seasons: [season(1, [episode(1, 1, { airDate: "2026-09-21" })])],
    });
    const tree = renderShowDetail(show, "America/Sao_Paulo", "2026-09-14");
    const button = findEpisodeButton("Mark watched", tree);

    expect(button.props.disabled).toBe(true);
    expect(button.props.title).toBe("Available Sep 21, 2026");
    expect(button.props["aria-label"]).toBe("Mark watched — Available Sep 21, 2026");
    (button.props.onClick as () => void)();
    await flushPromises();
    expect(setEpisodeWatchedActionMock).not.toHaveBeenCalled();
  });

  it("enables an unwatched episode on its local release date", () => {
    const show = showDetail({
      seasons: [season(1, [episode(1, 1, { airDate: "2026-09-21" })])],
    });
    const button = findEpisodeButton(
      "Mark watched",
      renderShowDetail(show, "America/Sao_Paulo", "2026-09-21"),
    );

    expect(button.props.disabled).toBe(false);
    expect(button.props.title).toBeUndefined();
  });

  it("keeps a released episode actionable", () => {
    const show = showDetail({
      seasons: [season(1, [episode(1, 1, { airDate: "2026-09-07" })])],
    });
    const button = findEpisodeButton(
      "Mark watched",
      renderShowDetail(show, "America/Sao_Paulo", "2026-09-14"),
    );

    expect(button.props.disabled).toBe(false);
  });

  it.each([
    ["null", null],
    ["invalid", "2026-02-29"],
  ])("preserves trackable fallback behavior for a %s air date", (_label, airDate) => {
    const show = showDetail({
      seasons: [season(1, [episode(1, 1, { airDate })])],
    });
    const button = findEpisodeButton(
      "Mark watched",
      renderShowDetail(show, "America/Sao_Paulo", "2026-09-14"),
    );

    expect(button.props.disabled).toBe(false);
  });

  it("keeps Mark unwatched enabled for an already-watched future episode", () => {
    const show = showDetail({
      seasons: [season(1, [episode(1, 1, { airDate: "2026-09-21", watched: true })])],
    });
    const button = findEpisodeButton(
      "Mark unwatched",
      renderShowDetail(show, "America/Sao_Paulo", "2026-09-14"),
    );

    expect(button.props.disabled).toBe(false);
    expect(button.props.title).toBeUndefined();
  });

  it("keeps a released episode disabled while its mutation is pending", () => {
    hookState.states = [null, null, {}, new Set(["1:2"])];
    const button = findEpisodeButton(
      "Mark watched",
      renderShowDetail(showDetail(), "America/Sao_Paulo", "2026-09-14"),
    );

    expect(button.props.disabled).toBe(true);
  });

  it("does not change season or show bulk-control eligibility", () => {
    const episodes = [
      episode(1, 1, { airDate: "2026-09-07" }),
      episode(1, 2, { airDate: "2026-09-21" }),
    ];
    const show = showDetail({
      progress: {
        displayStatus: "watchlist",
        progressPercentage: 0,
        status: "watchlist",
        totalEpisodeCount: 1,
        watchedEpisodeCount: 0,
      },
      seasons: [
        season(1, episodes, {
          progress: {
            displayStatus: "watchlist",
            progressPercentage: 0,
            status: "watchlist",
            totalEpisodeCount: 1,
            watchedEpisodeCount: 0,
          },
        }),
      ],
    });
    const tree = renderShowDetail(show, "America/Sao_Paulo", "2026-09-14");

    expect(findButton("Watch season", tree).props.disabled).toBe(false);
    expect(findButton("Mark watched", tree).props.disabled).toBe(false);
    expect(findEpisodeButton("Mark watched", tree, "Available Sep 21, 2026").props.disabled).toBe(true);
  });

  it("reconciles one optimistic episode from action props without an explicit refresh", async () => {
    const response = deferred<{ message: string; status: "success" }>();
    setEpisodeWatchedActionMock.mockReturnValueOnce(response.promise);
    const show = showDetail();

    (episodeButtons(renderShowDetail(show))[1]?.props.onClick as () => void)();
    const optimistic = renderShowDetail(show);
    expect(getText(episodeButtons(optimistic)[1]?.props.children as React.ReactNode)).toContain("Mark unwatched");
    expect(episodeButtons(optimistic)[1]?.props.disabled).toBe(true);
    expect(setEpisodeWatchedActionMock).toHaveBeenCalledWith({
      episodeNumber: 2, seasonNumber: 1, tmdbId: 100, watched: true,
    });

    const intermediateProps = showDetail();
    renderShowDetail(intermediateProps);
    expect(getText(episodeButtons(renderShowDetail(intermediateProps))[1]?.props.children as React.ReactNode)).toContain("Mark unwatched");

    const authoritative = showDetail({
      progress: { displayStatus: "caught_up", progressPercentage: 100, status: "watching", totalEpisodeCount: 2, watchedEpisodeCount: 2 },
      seasons: [season(1, [episode(1, 1, { watched: true }), episode(1, 2, { watched: true })])],
    });
    renderShowDetail(authoritative);
    expect(getText(episodeButtons(renderShowDetail(authoritative))[1]?.props.children as React.ReactNode)).toContain("Mark unwatched");

    response.resolve({ message: "Episode marked watched.", status: "success" });
    await flushPromises();
    expect(routerRefreshMock).not.toHaveBeenCalled();
    expect(hookState.states[2]).toEqual({});
    const reconciled = renderShowDetail(authoritative);
    expect(getText(episodeButtons(reconciled)[1]?.props.children as React.ReactNode)).toContain("Mark unwatched");
    expect(hasText("Caught up", reconciled)).toBe(true);
  });

  it("keeps other rows usable and serializes three rapid optimistic marks", async () => {
    const responses = [deferred<{ message: string; status: "success" }>(), deferred<{ message: string; status: "success" }>(), deferred<{ message: string; status: "success" }>()];
    responses.forEach((response) => setEpisodeWatchedActionMock.mockImplementationOnce(() => response.promise));
    const show = showDetail({
      progress: { displayStatus: "watchlist", progressPercentage: 0, status: "watchlist", totalEpisodeCount: 3, watchedEpisodeCount: 0 },
      seasons: [season(1, [episode(1, 5), episode(1, 6), episode(1, 7)])],
    });

    for (let index = 0; index < 3; index += 1) {
      const tree = renderShowDetail(show);
      expect(episodeButtons(tree)[index]?.props.disabled).toBe(false);
      (episodeButtons(tree)[index]?.props.onClick as () => void)();
    }
    const optimistic = renderShowDetail(show);
    expect(episodeButtons(optimistic).slice(0, 3).map((button) => getText(button.props.children as React.ReactNode))).toEqual([
      "Mark unwatched", "Mark unwatched", "Mark unwatched",
    ]);
    expect(hasText("Caught up", optimistic)).toBe(true);
    expect(setEpisodeWatchedActionMock).toHaveBeenCalledTimes(1);
    expect(findButton("Unwatch season", optimistic).props.disabled).toBe(true);
    expect(findButton("Mark watched", optimistic).props.disabled).toBe(true);
    expect(findButton("Drop", optimistic).props.disabled).toBe(true);
    expect(findButton("Refresh metadata", optimistic).props.disabled).toBe(true);
    expect(findButton("Favourite", optimistic).props.disabled).toBe(false);

    for (let index = 0; index < 3; index += 1) {
      responses[index]?.resolve({ message: "Episode marked watched.", status: "success" });
      await flushPromises();
      expect(setEpisodeWatchedActionMock).toHaveBeenCalledTimes(Math.min(index + 2, 3));
      if (index === 0) {
        const firstResponseProps = showDetail({
          progress: { displayStatus: "watching", progressPercentage: 33, status: "watching", totalEpisodeCount: 3, watchedEpisodeCount: 1 },
          seasons: [season(1, [episode(1, 5, { watched: true }), episode(1, 6), episode(1, 7)])],
        });
        renderShowDetail(firstResponseProps);
        expect(hookState.states[2]).toEqual({ "1:6": true, "1:7": true });
      }
      if (index === 1) {
        const finalResponseProps = showDetail({
          progress: { displayStatus: "caught_up", progressPercentage: 100, status: "watching", totalEpisodeCount: 3, watchedEpisodeCount: 3 },
          seasons: [season(1, [episode(1, 5, { watched: true }), episode(1, 6, { watched: true }), episode(1, 7, { watched: true })])],
        });
        renderShowDetail(finalResponseProps);
        expect(hookState.states[2]).toEqual({ "1:7": true });
      }
    }
    expect(setEpisodeWatchedActionMock.mock.calls.map(([input]) => input.episodeNumber)).toEqual([5, 6, 7]);
    expect(routerRefreshMock).not.toHaveBeenCalled();
    expect(hookState.states[2]).toEqual({});
    const authoritative = showDetail({
      progress: { displayStatus: "caught_up", progressPercentage: 100, status: "watching", totalEpisodeCount: 3, watchedEpisodeCount: 3 },
      seasons: [season(1, [episode(1, 5, { watched: true }), episode(1, 6, { watched: true }), episode(1, 7, { watched: true })])],
    });
    renderShowDetail(authoritative);
    expect(hookState.states[2]).toEqual({});
    expect(episodeButtons(renderShowDetail(authoritative)).slice(0, 3).map((button) => getText(button.props.children as React.ReactNode))).toEqual([
      "Mark unwatched", "Mark unwatched", "Mark unwatched",
    ]);
  });

  it("rolls back only the failed episode and continues the queue", async () => {
    const first = deferred<{ message: string; status: "error" }>();
    const second = deferred<{ message: string; status: "success" }>();
    setEpisodeWatchedActionMock.mockImplementationOnce(() => first.promise).mockImplementationOnce(() => second.promise);
    const show = showDetail({
      progress: { displayStatus: "watchlist", progressPercentage: 0, status: "watchlist", totalEpisodeCount: 2, watchedEpisodeCount: 0 },
      seasons: [season(1, [episode(1, 5), episode(1, 6)])],
    });

    (episodeButtons(renderShowDetail(show))[0]?.props.onClick as () => void)();
    (episodeButtons(renderShowDetail(show))[1]?.props.onClick as () => void)();
    first.resolve({ message: "This episode has not been released yet.", status: "error" });
    await flushPromises();
    const afterFailure = renderShowDetail(show);
    expect(getText(episodeButtons(afterFailure)[0]?.props.children as React.ReactNode)).toContain("Mark watched");
    expect(getText(episodeButtons(afterFailure)[1]?.props.children as React.ReactNode)).toContain("Mark unwatched");
    expect(hasText("This episode has not been released yet.", afterFailure)).toBe(true);
    expect(setEpisodeWatchedActionMock).toHaveBeenCalledTimes(2);

    second.resolve({ message: "Episode marked watched.", status: "success" });
    await flushPromises();
    expect(hasText("This episode has not been released yet.", renderShowDetail(show))).toBe(true);
    expect(routerRefreshMock).not.toHaveBeenCalled();
    const authoritative = showDetail({
      seasons: [season(1, [episode(1, 5), episode(1, 6, { watched: true })])],
    });
    renderShowDetail(authoritative);
    const reconciled = renderShowDetail(authoritative);
    expect(getText(episodeButtons(reconciled)[0]?.props.children as React.ReactNode)).toContain("Mark watched");
    expect(getText(episodeButtons(reconciled)[1]?.props.children as React.ReactNode)).toContain("Mark unwatched");
  });

  it("marks one episode unwatched without confirmation and prevents duplicate pending clicks", async () => {
    const confirm = vi.fn(() => false);
    vi.stubGlobal("window", { confirm });
    const response = deferred<{ message: string; status: "success" }>();
    setEpisodeWatchedActionMock.mockReturnValueOnce(response.promise);
    const show = showDetail();
    const originalButton = episodeButtons(renderShowDetail(show))[0];

    (originalButton?.props.onClick as () => void)();
    (originalButton?.props.onClick as () => void)();
    expect(confirm).not.toHaveBeenCalled();
    const optimistic = renderShowDetail(show);
    expect(getText(episodeButtons(optimistic)[0]?.props.children as React.ReactNode)).toContain("Mark watched");
    expect(episodeButtons(optimistic)[0]?.props.disabled).toBe(true);
    expect(setEpisodeWatchedActionMock).toHaveBeenCalledTimes(1);
    expect(setEpisodeWatchedActionMock).toHaveBeenCalledWith({
      episodeNumber: 1, seasonNumber: 1, tmdbId: 100, watched: false,
    });

    response.resolve({ message: "Episode marked unwatched.", status: "success" });
    await flushPromises();
    expect(routerRefreshMock).not.toHaveBeenCalled();
  });

  it.each([false, true])("requires confirmation before reset when confirmation is %s", async (confirmed) => {
    const confirm = vi.fn(() => confirmed);
    vi.stubGlobal("window", { confirm });
    resetShowProgressActionMock.mockResolvedValue({ status: "success", message: "Reset." });
    (findButton("Reset", renderShowDetail()).props.onClick as () => void)();
    expect(confirm).toHaveBeenCalledWith("Reset all watched progress for Arcane?");
    expect(resetShowProgressActionMock).toHaveBeenCalledTimes(confirmed ? 1 : 0);
    if (confirmed) expect(resetShowProgressActionMock).toHaveBeenCalledWith(100);
    expect(setEpisodeWatchedActionMock).not.toHaveBeenCalled();
    await flushPromises();
  });

  it.each([false, true])("requires confirmation before unwatching a whole season when confirmation is %s", async (confirmed) => {
    const confirm = vi.fn(() => confirmed);
    vi.stubGlobal("window", { confirm });
    setSeasonWatchedActionMock.mockResolvedValue({ status: "success", message: "Season updated." });
    const show = showDetail({ seasons: [season(1, [episode(1, 1, { watched: true })])] });
    (findButton("Unwatch season", renderShowDetail(show)).props.onClick as () => void)();
    expect(confirm).toHaveBeenCalledWith("Mark Season 1 unwatched?");
    expect(setSeasonWatchedActionMock).toHaveBeenCalledTimes(confirmed ? 1 : 0);
    if (confirmed) expect(setSeasonWatchedActionMock).toHaveBeenCalledWith({
      seasonNumber: 1, tmdbId: 100, watched: false,
    });
    expect(setEpisodeWatchedActionMock).not.toHaveBeenCalled();
    await flushPromises();
  });

  it("keeps queued mutations when the visible season changes", async () => {
    vi.stubGlobal("window", {
      history: { replaceState: vi.fn() },
      location: { pathname: "/shows/100", search: "" },
    });
    const first = deferred<{ message: string; status: "success" }>();
    const second = deferred<{ message: string; status: "success" }>();
    setEpisodeWatchedActionMock.mockImplementationOnce(() => first.promise).mockImplementationOnce(() => second.promise);
    const show = showDetail({
      progress: { displayStatus: "watchlist", progressPercentage: 0, status: "watchlist", totalEpisodeCount: 2, watchedEpisodeCount: 0 },
      seasons: [season(1, [episode(1, 5)]), season(2, [episode(2, 1)])],
    });

    (episodeButtons(renderShowDetail(show))[0]?.props.onClick as () => void)();
    const select = findElements(renderShowDetail(show), (element) => element.type === "select")[0];
    (select?.props.onChange as (event: { target: { value: string } }) => void)({ target: { value: "2" } });
    const nextSeason = renderShowDetail(show);
    expect(hasText("Season 2", nextSeason)).toBe(true);
    (episodeButtons(nextSeason)[0]?.props.onClick as () => void)();
    expect(setEpisodeWatchedActionMock).toHaveBeenCalledTimes(1);

    first.resolve({ message: "Episode marked watched.", status: "success" });
    await flushPromises();
    expect(setEpisodeWatchedActionMock).toHaveBeenCalledTimes(2);
    expect(setEpisodeWatchedActionMock.mock.calls.map(([input]) => [input.seasonNumber, input.episodeNumber])).toEqual([
      [1, 5], [2, 1],
    ]);
    second.resolve({ message: "Episode marked watched.", status: "success" });
    await flushPromises();
    expect(routerRefreshMock).not.toHaveBeenCalled();
  });

  it("allows optimistic cleanup of a watched future episode while still blocking a new future mark", async () => {
    vi.stubGlobal("window", { confirm: vi.fn(() => true) });
    const response = deferred<{ message: string; status: "success" }>();
    setEpisodeWatchedActionMock.mockReturnValueOnce(response.promise);
    const show = showDetail({
      seasons: [season(1, [episode(1, 1, { airDate: "2026-09-21", watched: true })])],
    });

    (episodeButtons(renderShowDetail(show, "America/Sao_Paulo", "2026-09-14"))[0]?.props.onClick as () => void)();
    const optimistic = renderShowDetail(show, "America/Sao_Paulo", "2026-09-14");
    expect(getText(episodeButtons(optimistic)[0]?.props.children as React.ReactNode)).toContain("Mark watched");
    expect(episodeButtons(optimistic)[0]?.props.disabled).toBe(true);
    expect(setEpisodeWatchedActionMock).toHaveBeenCalledWith({
      episodeNumber: 1, seasonNumber: 1, tmdbId: 100, watched: false,
    });
    response.resolve({ message: "Episode marked unwatched.", status: "success" });
    await flushPromises();
    const afterSync = renderShowDetail(show, "America/Sao_Paulo", "2026-09-14");
    expect(episodeButtons(afterSync)[0]?.props.disabled).toBe(true);
  });

  it("permits an optimistic manual mark for a released Special", async () => {
    const response = deferred<{ message: string; status: "success" }>();
    setEpisodeWatchedActionMock.mockReturnValueOnce(response.promise);
    const show = showDetail({ seasons: [season(0, [episode(0, 1)])] });

    (episodeButtons(renderShowDetail(show, "UTC", "2026-09-14"))[0]?.props.onClick as () => void)();
    expect(getText(episodeButtons(renderShowDetail(show, "UTC", "2026-09-14"))[0]?.props.children as React.ReactNode)).toContain("Mark unwatched");
    expect(setEpisodeWatchedActionMock).toHaveBeenCalledWith({
      episodeNumber: 1, seasonNumber: 0, tmdbId: 100, watched: true,
    });
    response.resolve({ message: "Episode marked watched.", status: "success" });
    await flushPromises();
  });

  it("does not update component state or refresh after unmount", async () => {
    const response = deferred<{ message: string; status: "success" }>();
    setEpisodeWatchedActionMock.mockReturnValueOnce(response.promise);
    const show = showDetail();

    (episodeButtons(renderShowDetail(show))[1]?.props.onClick as () => void)();
    const stateAtUnmount = [...hookState.states];
    hookState.effectCleanups[0]?.();
    response.resolve({ message: "Episode marked watched.", status: "success" });
    await flushPromises();

    expect(hookState.states).toEqual(stateAtUnmount);
    expect(routerRefreshMock).not.toHaveBeenCalled();
  });
});

import * as React from "react";
import { Check, Loader2 } from "lucide-react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DashboardView } from "../features/dashboard/components/dashboard-view";
import type { ContinueWatchingItem, DashboardData } from "../features/dashboard/types";

const hooks = vi.hoisted(() => ({
  effectDeps: [] as Array<readonly unknown[] | undefined>,
  effectIndex: 0,
  effects: [] as Array<{ effect: () => void | (() => void); index: number }>,
  cleanups: [] as Array<(() => void) | undefined>,
  refIndex: 0,
  refs: [] as Array<{ current: unknown }>,
  stateIndex: 0,
  states: [] as unknown[],
}));
const refresh = vi.hoisted(() => vi.fn());
const markWatched = vi.hoisted(() => vi.fn());
const getTmdbImageUrl = vi.hoisted(() => vi.fn(() => null as string | null));

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return {
    ...actual,
    useEffect: (effect: () => void | (() => void), deps?: readonly unknown[]) => {
      const index = hooks.effectIndex++;
      const previous = hooks.effectDeps[index];
      if (!previous || !deps || deps.some((value, position) => !Object.is(value, previous[position]))) {
        hooks.cleanups[index]?.();
        hooks.effectDeps[index] = deps;
        hooks.effects.push({ effect, index });
      }
    },
    useRef: (initial: unknown) => {
      const index = hooks.refIndex++;
      hooks.refs[index] ??= { current: initial };
      return hooks.refs[index];
    },
    useState: (initial: unknown) => {
      const index = hooks.stateIndex++;
      if (hooks.states[index] === undefined) {
        hooks.states[index] = typeof initial === "function" ? (initial as () => unknown)() : initial;
      }
      return [hooks.states[index], (next: unknown) => {
        hooks.states[index] = typeof next === "function"
          ? (next as (value: unknown) => unknown)(hooks.states[index])
          : next;
      }];
    },
  };
});

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("next/link", () => ({ default: () => null }));
vi.mock("@/components/library-summary-tiles", () => ({ LibrarySummaryTiles: () => null }));
vi.mock("@/components/ui/action-feedback", () => ({ ACTION_FEEDBACK_AUTO_DISMISS_MS: 3_000, ActionFeedback: () => null }));
vi.mock("@/components/ui/button", () => ({ Button: () => null }));
vi.mock("@/components/ui/card", () => ({ Card: () => null, CardContent: () => null }));
vi.mock("@/components/ui/empty-state", () => ({ EmptyState: () => null }));
vi.mock("@/components/ui/progress-bar", () => ({ ProgressBar: () => null }));
vi.mock("@/lib/tmdb/images", () => ({ getTmdbImageUrl }));
vi.mock("@/lib/utils", () => ({ cn: (...values: unknown[]) => values.filter(Boolean).join(" ") }));
vi.mock("../features/dashboard/actions", () => ({ markContinueWatchingEpisodeWatchedAction: markWatched }));

function item(tmdbId: number, episodeNumber = 2): ContinueWatchingItem {
  return {
    displayStatus: "watching",
    isFaded: false,
    lastWatchedAt: null,
    nextEpisode: { airDate: "2026-01-01", episodeNumber, seasonNumber: 1, title: `Episode ${episodeNumber}` },
    posterPath: null,
    progressPercentage: 25,
    title: `Show ${tmdbId}`,
    tmdbId,
    totalEpisodeCount: 4,
    watchedEpisodeCount: 1,
  };
}

function data(episodes = [item(100), item(200), item(300)]): DashboardData {
  return {
    continueWatching: episodes,
    hiddenContinueWatchingCount: 0,
    startWatching: [{ detailHref: "/shows/400", episodeNumber: 1, episodeTitle: "Start", posterPath: null, seasonNumber: 1, showTitle: "Start Show", tmdbId: 400 }],
    summary: { caughtUpCount: 0, completedCount: 0, droppedCount: 0, favouriteCount: 0, totalShows: 4, watchingCount: 3, watchlistCount: 1 },
    upcomingEpisodes: [{ airDate: "2026-10-01", detailHref: "/shows/100?season=1", episodeNumber: 4, episodeTitle: "Future", posterPath: null, seasonNumber: 1, showTitle: "Show 100", tmdbId: 100 }],
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((complete, fail) => { resolve = complete; reject = fail; });
  return { promise, reject, resolve };
}

function elements(node: React.ReactNode): React.ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!React.isValidElement(node)) return [];
  const element = node as React.ReactElement<Record<string, unknown>>;
  return [element, ...elements(element.props.children as React.ReactNode)];
}

function componentProps(tree: React.ReactNode, name: string) {
  return elements(tree)
    .filter((element) => typeof element.type === "function" && element.type.name === name)
    .map((element) => element.props);
}

function cards(tree: React.ReactNode) {
  return componentProps(tree, "ContinueWatchingCard") as Array<{
    item: ContinueWatchingItem;
    onMarkNextWatched: (item: ContinueWatchingItem) => void;
    pending: boolean;
  }>;
}

function cardIds(tree: React.ReactNode) {
  return cards(tree).map((card) => card.item.tmdbId);
}

function cardPending(tree: React.ReactNode, showId: number) {
  return cards(tree).find(({ item: current }) => current.tmdbId === showId)?.pending;
}

function renderCard(tree: React.ReactNode, showId: number) {
  const card = elements(tree).find((element) =>
    typeof element.type === "function"
    && element.type.name === "ContinueWatchingCard"
    && (element.props.item as ContinueWatchingItem).tmdbId === showId,
  );
  if (!card || typeof card.type !== "function") throw new Error(`Missing card ${showId}`);
  return (card.type as (props: Record<string, unknown>) => React.ReactNode)(card.props);
}

function markButton(tree: React.ReactNode, showId: number) {
  const button = elements(renderCard(tree, showId)).find((element) => element.props.type === "button");
  if (!button) throw new Error(`Missing tracking button ${showId}`);
  return button;
}

function click(tree: React.ReactNode, showId: number) {
  const card = cards(tree).find(({ item: current }) => current.tmdbId === showId);
  if (!card) throw new Error(`Missing card ${showId}`);
  card.onMarkNextWatched(card.item);
  return card;
}

function renderDashboard(nextData: DashboardData) {
  hooks.effectIndex = 0;
  hooks.refIndex = 0;
  hooks.stateIndex = 0;
  const tree = DashboardView({ data: nextData });
  for (const { effect, index } of hooks.effects.splice(0)) {
    const cleanup = effect();
    hooks.cleanups[index] = typeof cleanup === "function" ? cleanup : undefined;
  }
  return tree;
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}

const success = { message: "Episode marked watched.", status: "success" } as const;

describe("Dashboard view", () => {
  beforeEach(() => {
    (globalThis as typeof globalThis & { React: typeof React }).React = React;
    hooks.effectDeps = [];
    hooks.effectIndex = 0;
    hooks.effects = [];
    hooks.cleanups = [];
    hooks.refIndex = 0;
    hooks.refs = [];
    hooks.stateIndex = 0;
    hooks.states = [];
    refresh.mockReset();
    markWatched.mockReset();
    getTmdbImageUrl.mockReset();
    getTmdbImageUrl.mockReturnValue(null);
  });

  it.each([false, true])("opens the full Watchlist below Start Watching, including the empty state: %s", (empty) => {
    const baseline = data();
    if (empty) baseline.startWatching = [];
    const section = elements(renderDashboard(baseline)).find((element) =>
      element.type === "section" && element.props["aria-labelledby"] === "start-watching-heading",
    );
    expect(section).toBeDefined();
    const children = React.Children.toArray(section?.props.children as React.ReactNode);
    const footer = children.at(-1);
    const link = elements(footer).find((element) => element.props.href);
    expect(link?.props.href).toBe("/library?filter=watchlist");
    expect(link?.props.children).toBe("Open Watchlist");
    expect(elements(footer).find((element) => element.props.asChild)?.props.variant).toBe("outline");
    expect(componentProps(section, "StartWatchingCard")).toHaveLength(empty ? 0 : 1);
    expect(markWatched).not.toHaveBeenCalled();
  });

  it("links the poster and title to Show Detail without a Details button", () => {
    const tree = renderDashboard(data());
    const card = renderCard(tree, 100);
    const poster = elements(card).find((element) => typeof element.type === "function" && element.type.name === "ContinuePoster");
    expect(poster).toBeDefined();
    const posterLink = (poster?.type as (props: Record<string, unknown>) => React.ReactNode)(poster?.props ?? {});
    const posterAnchor = elements(posterLink).find((element) => element.props.href === "/shows/100");
    const titleAnchor = elements(card).find((element) => element.props.href === "/shows/100");

    expect(posterAnchor?.props["aria-label"]).toBe("View details for Show 100 poster");
    expect(titleAnchor?.props["aria-label"]).toBe("View details for Show 100");
    expect(elements(card).filter((element) => element.props.type === "button")).toHaveLength(1);
    expect(elements(card).some((element) => element.props.children === "Details")).toBe(false);
    expect(elements(posterLink).some((element) => element.props.type === "button")).toBe(false);

    const posterContainer = elements(card).find((element) =>
      element.type === "div" && Array.isArray(element.props.children) && element.props.children.includes(poster),
    );
    expect(posterContainer).toBeDefined();
    expect(elements(posterContainer).filter((element) => element.props.type === "button")).toHaveLength(1);
    expect(componentProps(posterContainer, "ProgressBar")).toHaveLength(0);

    getTmdbImageUrl.mockReturnValue("https://example.test/poster.jpg");
    const imagePoster = elements((poster?.type as (props: Record<string, unknown>) => React.ReactNode)(poster?.props ?? {}));
    expect(imagePoster.find((element) => element.props.href === "/shows/100")?.props["aria-label"]).toBe("View details for Show 100 poster");
    expect(imagePoster.find((element) => element.props.alt === "Show 100 poster")).toBeDefined();
  });

  it.each([null, "/poster.jpg"])("links Upcoming poster and title to the episode's season with poster path %s", (posterPath) => {
    const baseline = data();
    const upcoming = baseline.upcomingEpisodes[0];
    if (!upcoming) throw new Error("Missing upcoming fixture");
    upcoming.posterPath = posterPath;
    getTmdbImageUrl.mockReturnValue(posterPath ? "https://example.test/upcoming-poster.jpg" : null);
    const card = elements(renderDashboard(baseline)).find((element) =>
      typeof element.type === "function" && element.type.name === "UpcomingEpisodeCard",
    );
    if (!card || typeof card.type !== "function") throw new Error("Missing Upcoming card");
    const rendered = (card.type as (props: Record<string, unknown>) => React.ReactNode)(card.props);
    const links = elements(rendered).filter((element) => element.props.href);

    expect(links.map((link) => [link.props.href, link.props["aria-label"]])).toEqual([
      ["/shows/100?season=1", "View details for Show 100 poster"],
      ["/shows/100?season=1", "View details for Show 100"],
    ]);
    expect(links[1]?.props.children).toBe("Show 100");
    expect(elements(rendered).some((element) => element.props.children === "Details")).toBe(false);
    expect(elements(rendered).some((element) => element.props.asChild || element.props.type === "button")).toBe(false);
    expect(elements(rendered).some((element) => element.props.children === "S1E4")).toBe(true);
    expect(getTmdbImageUrl).toHaveBeenCalledWith(posterPath, "w185");

    if (posterPath) {
      expect(elements(links[0]).find((element) => element.props.alt === "Show 100 poster")?.props.src).toBe("https://example.test/upcoming-poster.jpg");
    } else {
      expect(elements(links[0]).find((element) => element.props["aria-hidden"] === "true")?.props.children).toBe("S");
    }
  });

  it("uses a labelled icon button to enqueue the displayed episode", () => {
    const response = deferred<typeof success>();
    markWatched.mockReturnValue(response.promise);
    const baseline = data();
    const button = markButton(renderDashboard(baseline), 100);
    expect(button.props["aria-label"]).toBe("Mark Show 100 S1E2 watched");
    expect(button.props.size).toBe("icon");
    expect(React.isValidElement(button.props.children)).toBe(true);
    expect((button.props.children as React.ReactElement).type).toBe(Check);
    expect(button.props["aria-busy"]).toBe(false);

    (button.props.onClick as () => void)();
    expect(markWatched).toHaveBeenCalledWith({ episodeNumber: 2, seasonNumber: 1, tmdbId: 100 });
    const pending = markButton(renderDashboard(baseline), 100);
    expect(pending.props.disabled).toBe(true);
    expect(pending.props["aria-label"]).toBe("Marking Show 100 S1E2 watched");
    expect(pending.props["aria-busy"]).toBe(true);
    expect((pending.props.children as React.ReactElement).type).toBe(Loader2);
  });

  it("keeps one card visible and saving until authoritative props advance it", async () => {
    const response = deferred<typeof success>();
    markWatched.mockReturnValue(response.promise);
    const baseline = data();

    click(renderDashboard(baseline), 100);
    const pending = renderDashboard(baseline);
    expect(cardIds(pending)).toEqual([100, 200, 300]);
    expect(markButton(pending, 100).props.disabled).toBe(true);
    expect(markButton(pending, 100).props["aria-busy"]).toBe(true);
    expect(markButton(pending, 200).props.disabled).toBe(false);
    expect(markWatched).toHaveBeenCalledWith({ episodeNumber: 2, seasonNumber: 1, tmdbId: 100 });
    expect(refresh).not.toHaveBeenCalled();

    const authoritative = data([item(100, 3), item(200), item(300)]);
    renderDashboard(authoritative);
    expect(cardIds(renderDashboard(authoritative))).toEqual([100, 200, 300]);
    expect(cardPending(renderDashboard(authoritative), 100)).toBe(true);

    response.resolve(success);
    await flushPromises();
    expect(refresh).not.toHaveBeenCalled();
    expect(hooks.states[1]).toEqual(new Set());
    expect(cards(renderDashboard(authoritative))[0]?.item.nextEpisode.episodeNumber).toBe(3);
    expect(cardIds(renderDashboard(authoritative))).toEqual([100, 200, 300]);
    expect(markButton(renderDashboard(authoritative), 100).props.disabled).toBe(false);
  });

  it("removes a card only when authoritative props no longer include its show", async () => {
    const response = deferred<typeof success>();
    markWatched.mockReturnValue(response.promise);
    const baseline = data();
    click(renderDashboard(baseline), 100);
    expect(cardIds(renderDashboard(baseline))).toEqual([100, 200, 300]);

    const caughtUp = data([item(200), item(300)]);
    renderDashboard(caughtUp);
    expect(cardIds(renderDashboard(caughtUp))).toEqual([200, 300]);
    response.resolve(success);
    await flushPromises();
    expect(cardIds(renderDashboard(caughtUp))).toEqual([200, 300]);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("keeps other cards clickable, blocks duplicate clicks, and serializes three requests", async () => {
    const responses = [deferred<typeof success>(), deferred<typeof success>(), deferred<typeof success>()];
    responses.forEach((response) => markWatched.mockImplementationOnce(() => response.promise));
    const baseline = data();

    const staleCard = click(renderDashboard(baseline), 100);
    staleCard.onMarkNextWatched(staleCard.item);
    expect(markButton(renderDashboard(baseline), 100).props.disabled).toBe(true);
    expect(markButton(renderDashboard(baseline), 200).props.disabled).toBe(false);
    click(renderDashboard(baseline), 200);
    click(renderDashboard(baseline), 300);
    const allPending = renderDashboard(baseline);
    expect(cardIds(allPending)).toEqual([100, 200, 300]);
    expect(cards(allPending).map(({ pending }) => pending)).toEqual([true, true, true]);
    expect(markWatched).toHaveBeenCalledTimes(1);

    for (let index = 0; index < responses.length; index += 1) {
      responses[index]?.resolve(success);
      await flushPromises();
      expect(markWatched).toHaveBeenCalledTimes(Math.min(index + 2, 3));
      if (index === 0) {
        const firstResponseProps = data([item(100, 3), item(200), item(300)]);
        renderDashboard(firstResponseProps);
        expect(cardIds(renderDashboard(firstResponseProps))).toEqual([100, 200, 300]);
        expect(cards(renderDashboard(firstResponseProps)).map(({ pending }) => pending)).toEqual([false, true, true]);
      }
      if (index === 1) {
        const finalResponseProps = data([item(100, 3), item(200, 3)]);
        renderDashboard(finalResponseProps);
        expect(cardIds(renderDashboard(finalResponseProps))).toEqual([100, 200]);
        expect(cards(renderDashboard(finalResponseProps)).map(({ pending }) => pending)).toEqual([false, false]);
      }
      expect(refresh).not.toHaveBeenCalled();
    }
    expect(markWatched.mock.calls.map(([input]) => input.tmdbId)).toEqual([100, 200, 300]);
    expect(hooks.states[1]).toEqual(new Set());
  });

  it("keeps a failed card visible, clears its pending state, and continues the queue", async () => {
    const first = deferred<{ message: string; status: "error" }>();
    const second = deferred<typeof success>();
    markWatched.mockImplementationOnce(() => first.promise).mockImplementationOnce(() => second.promise);
    const baseline = data();

    click(renderDashboard(baseline), 100);
    click(renderDashboard(baseline), 200);
    first.resolve({ message: "The next episode has changed.", status: "error" });
    await flushPromises();
    const afterFailure = renderDashboard(baseline);
    expect(cardIds(afterFailure)).toEqual([100, 200, 300]);
    expect(cardPending(afterFailure, 100)).toBe(false);
    expect(cardPending(afterFailure, 200)).toBe(true);
    expect(markButton(afterFailure, 100).props.disabled).toBe(false);
    expect(componentProps(afterFailure, "ActionFeedback")[0]?.children).toBe("The next episode has changed.");
    expect(componentProps(afterFailure, "ActionFeedback")[0]?.presentation).toBe("toast");
    expect(markWatched).toHaveBeenCalledTimes(2);

    second.resolve(success);
    await flushPromises();
    expect(cardIds(renderDashboard(baseline))).toEqual([100, 200, 300]);
    expect(cardPending(renderDashboard(baseline), 200)).toBe(true);
    expect(componentProps(renderDashboard(baseline), "ActionFeedback")[0]?.children).toBe("The next episode has changed.");
    expect(refresh).not.toHaveBeenCalled();
    const authoritative = data([item(100), item(200, 3), item(300)]);
    renderDashboard(authoritative);
    expect(cardIds(renderDashboard(authoritative))).toEqual([100, 200, 300]);
    expect(cardPending(renderDashboard(authoritative), 200)).toBe(false);
  });

  it("continues queued work when a server action rejects unexpectedly", async () => {
    const first = deferred<typeof success>();
    const second = deferred<typeof success>();
    markWatched.mockImplementationOnce(() => first.promise).mockImplementationOnce(() => second.promise);
    const baseline = data();
    click(renderDashboard(baseline), 100);
    click(renderDashboard(baseline), 200);

    first.reject(new Error("transport"));
    await flushPromises();
    expect(cardIds(renderDashboard(baseline))).toEqual([100, 200, 300]);
    expect(cardPending(renderDashboard(baseline), 100)).toBe(false);
    expect(cardPending(renderDashboard(baseline), 200)).toBe(true);
    expect(componentProps(renderDashboard(baseline), "ActionFeedback")[0]?.children).toBe("Unable to update this episode right now.");
    expect(markWatched).toHaveBeenCalledTimes(2);
    second.resolve(success);
    await flushPromises();
    expect(componentProps(renderDashboard(baseline), "ActionFeedback")[0]?.children).toBe("Unable to update this episode right now.");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("keeps pending state through intermediate props and leaves Upcoming and Start Watching authoritative", async () => {
    const response = deferred<typeof success>();
    markWatched.mockReturnValue(response.promise);
    const baseline = data();
    click(renderDashboard(baseline), 100);

    const intermediate = data([item(100), item(200, 4), item(300)]);
    const pending = renderDashboard(intermediate);
    expect(cardIds(pending)).toEqual([100, 200, 300]);
    expect(cardPending(pending, 100)).toBe(true);
    expect(cards(pending)[1]?.item.nextEpisode.episodeNumber).toBe(4);
    expect(cardPending(pending, 200)).toBe(false);
    expect(componentProps(pending, "UpcomingEpisodeCard")[0]?.item).toEqual(intermediate.upcomingEpisodes[0]);
    expect(componentProps(pending, "StartWatchingCard")[0]?.item).toEqual(intermediate.startWatching[0]);
    expect(componentProps(pending, "LibrarySummaryTiles")[0]?.summary).toEqual(intermediate.summary);

    response.resolve(success);
    await flushPromises();
    const authoritative = data([item(100, 3), item(200), item(300)]);
    renderDashboard(authoritative);
    expect(cardIds(renderDashboard(authoritative))).toEqual([100, 200, 300]);
    expect(cardPending(renderDashboard(authoritative), 100)).toBe(false);
  });

  it("does not update state or refresh after unmount", async () => {
    const response = deferred<typeof success>();
    markWatched.mockReturnValue(response.promise);
    const baseline = data();
    click(renderDashboard(baseline), 100);
    const stateAtUnmount = [...hooks.states];
    hooks.cleanups[0]?.();

    response.resolve(success);
    await flushPromises();
    expect(hooks.states).toEqual(stateAtUnmount);
    expect(refresh).not.toHaveBeenCalled();
  });
});

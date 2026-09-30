import * as React from "react";
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
vi.mock("@/components/ui/action-feedback", () => ({ ACTION_FEEDBACK_AUTO_DISMISS_MS: 5_000, ActionFeedback: () => null }));
vi.mock("@/components/ui/button", () => ({ Button: () => null }));
vi.mock("@/components/ui/card", () => ({ Card: () => null, CardContent: () => null }));
vi.mock("@/components/ui/empty-state", () => ({ EmptyState: () => null }));
vi.mock("@/components/ui/progress-bar", () => ({ ProgressBar: () => null }));
vi.mock("@/lib/tmdb/images", () => ({ getTmdbImageUrl: () => null }));
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
    upcomingEpisodes: [{ airDate: "2026-10-01", detailHref: "/shows/100", episodeNumber: 4, episodeTitle: "Future", seasonNumber: 1, showTitle: "Show 100", tmdbId: 100 }],
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
  }>;
}

function cardIds(tree: React.ReactNode) {
  return cards(tree).map((card) => card.item.tmdbId);
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

describe("Dashboard Continue Watching queue", () => {
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
  });

  it("removes one card immediately, then refreshes once after the server action", async () => {
    const response = deferred<typeof success>();
    markWatched.mockReturnValue(response.promise);
    const baseline = data();

    click(renderDashboard(baseline), 100);
    expect(cardIds(renderDashboard(baseline))).toEqual([200, 300]);
    expect(markWatched).toHaveBeenCalledWith({ episodeNumber: 2, seasonNumber: 1, tmdbId: 100 });
    expect(refresh).not.toHaveBeenCalled();

    response.resolve(success);
    await flushPromises();
    expect(cardIds(renderDashboard(baseline))).toEqual([200, 300]);
    expect(refresh).toHaveBeenCalledTimes(1);

    const authoritative = data([item(100, 3), item(200), item(300)]);
    renderDashboard(authoritative);
    expect(cards(renderDashboard(authoritative))[0]?.item.nextEpisode.episodeNumber).toBe(3);
    expect(cardIds(renderDashboard(authoritative))).toEqual([100, 200, 300]);
  });

  it("keeps other cards clickable, blocks duplicate clicks, and serializes three requests", async () => {
    const responses = [deferred<typeof success>(), deferred<typeof success>(), deferred<typeof success>()];
    responses.forEach((response) => markWatched.mockImplementationOnce(() => response.promise));
    const baseline = data();

    const staleCard = click(renderDashboard(baseline), 100);
    staleCard.onMarkNextWatched(staleCard.item);
    click(renderDashboard(baseline), 200);
    click(renderDashboard(baseline), 300);
    expect(cardIds(renderDashboard(baseline))).toEqual([]);
    expect(markWatched).toHaveBeenCalledTimes(1);

    for (let index = 0; index < responses.length; index += 1) {
      responses[index]?.resolve(success);
      await flushPromises();
      expect(markWatched).toHaveBeenCalledTimes(Math.min(index + 2, 3));
      if (index < 2) expect(refresh).not.toHaveBeenCalled();
    }
    expect(markWatched.mock.calls.map(([input]) => input.tmdbId)).toEqual([100, 200, 300]);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("restores only a failed card in server order, shows its error, and continues the queue", async () => {
    const first = deferred<{ message: string; status: "error" }>();
    const second = deferred<typeof success>();
    markWatched.mockImplementationOnce(() => first.promise).mockImplementationOnce(() => second.promise);
    const baseline = data();

    click(renderDashboard(baseline), 100);
    click(renderDashboard(baseline), 200);
    first.resolve({ message: "The next episode has changed.", status: "error" });
    await flushPromises();
    const afterFailure = renderDashboard(baseline);
    expect(cardIds(afterFailure)).toEqual([100, 300]);
    expect(componentProps(afterFailure, "ActionFeedback")[0]?.children).toBe("The next episode has changed.");
    expect(markWatched).toHaveBeenCalledTimes(2);

    second.resolve(success);
    await flushPromises();
    expect(cardIds(renderDashboard(baseline))).toEqual([100, 300]);
    expect(componentProps(renderDashboard(baseline), "ActionFeedback")[0]?.children).toBe("The next episode has changed.");
    expect(refresh).toHaveBeenCalledTimes(1);
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
    expect(cardIds(renderDashboard(baseline))).toEqual([100, 300]);
    expect(componentProps(renderDashboard(baseline), "ActionFeedback")[0]?.children).toBe("Unable to update this episode right now.");
    expect(markWatched).toHaveBeenCalledTimes(2);
    second.resolve(success);
    await flushPromises();
    expect(componentProps(renderDashboard(baseline), "ActionFeedback")[0]?.children).toBe("Unable to update this episode right now.");
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("keeps removals through intermediate props and leaves Upcoming and Start Watching authoritative", async () => {
    const response = deferred<typeof success>();
    markWatched.mockReturnValue(response.promise);
    const baseline = data();
    click(renderDashboard(baseline), 100);

    const intermediate = data([item(100), item(200), item(300)]);
    const pending = renderDashboard(intermediate);
    expect(cardIds(pending)).toEqual([200, 300]);
    expect(componentProps(pending, "UpcomingEpisodeCard")[0]?.item).toEqual(intermediate.upcomingEpisodes[0]);
    expect(componentProps(pending, "StartWatchingCard")[0]?.item).toEqual(intermediate.startWatching[0]);
    expect(componentProps(pending, "LibrarySummaryTiles")[0]?.summary).toEqual(intermediate.summary);

    response.resolve(success);
    await flushPromises();
    const authoritative = data([item(100, 3), item(200), item(300)]);
    renderDashboard(authoritative);
    expect(cardIds(renderDashboard(authoritative))).toEqual([100, 200, 300]);
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

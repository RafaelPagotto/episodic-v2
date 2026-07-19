import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ShowDetailView } from "../features/shows/components/show-detail-view";
import type { ShowDetail, ShowDetailEpisode, ShowDetailSeason } from "../features/shows";

const hookState = vi.hoisted(() => ({
  stateIndex: 0,
  states: [] as unknown[],
  transitionPending: false,
}));
const routerRefreshMock = vi.hoisted(() => vi.fn());
const refreshShowMetadataActionMock = vi.hoisted(() => vi.fn());

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");

  return {
    ...actual,
    useEffect: vi.fn(),
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
  resetShowProgressAction: vi.fn(),
  setEpisodeWatchedAction: vi.fn(),
  setSeasonWatchedAction: vi.fn(),
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

function renderShowDetail(show: ShowDetail = showDetail(), timeZone = "UTC") {
  hookState.stateIndex = 0;
  return ShowDetailView({ show, timeZone });
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

  return predicate(element) ? [element, ...childMatches] : childMatches;
}

function findButton(text: string, tree: React.ReactNode) {
  const button = findElements(
    tree,
    (element) =>
      typeof element.props.onClick === "function"
      && getText(element.props.children as React.ReactNode).includes(text),
  )[0];

  if (!button) {
    throw new Error(`Button not found: ${text}`);
  }

  return button;
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
  beforeEach(() => {
    (globalThis as typeof globalThis & { React: typeof React }).React = React;
    hookState.stateIndex = 0;
    hookState.states = [];
    hookState.transitionPending = false;
    routerRefreshMock.mockReset();
    refreshShowMetadataActionMock.mockReset();
    refreshShowMetadataActionMock.mockResolvedValue({
      message: "Refreshed metadata for Arcane.",
      status: "success",
    });
  });

  it("renders Refresh metadata without replacing existing actions", () => {
    const tree = renderShowDetail();

    expect(hasText("Refresh metadata", tree)).toBe(true);
    expect(hasText("Favourite", tree)).toBe(true);
    expect(hasText("Drop", tree)).toBe(true);
    expect(hasText("Mark watched", tree)).toBe(true);
    expect(hasText("Reset", tree)).toBe(true);
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
    expect(hasText("Refreshing", tree)).toBe(true);
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
});

import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/components/ui/button", () => ({ Button: () => null }));
vi.mock("@/components/ui/card", () => ({ Card: () => null, CardContent: () => null }));
vi.mock("@/features/search/components/search-synopsis", () => ({ SearchSynopsis: () => null }));
vi.mock("@/features/shows/routes", async () => import("../features/shows/routes"));
vi.mock("@/features/preferences/card-appearance", () => ({ FADED_SHOW_CARD_CLASS_NAME: "opacity-50 hover:opacity-100 focus-within:opacity-100" }));
vi.mock("@/lib/date-only", async () => import("../lib/date-only"));
vi.mock("@/lib/utils", () => ({ cn: (...values: unknown[]) => values.filter(Boolean).join(" ") }));
vi.mock("@/lib/tmdb/images", () => ({ getTmdbImageUrl: (path: string | null) => path ? `https://image.tmdb.org/t/p/w342${path}` : null }));
import { ShowResultCard, showRating } from "../features/discover/components/show-result-card";
import type { NormalizedTmdbSearchResult } from "../lib/tmdb/types";
const show = { title: "Dark", tmdbId: 10, firstAirDate: "2017-12-01", voteAverage: 8.86, voteCount: 200, posterPath: "/poster.jpg", overview: "Complete synopsis." } as NormalizedTmdbSearchResult;
function nodes(node: React.ReactNode): React.ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!React.isValidElement(node)) return [];
  const element = node as React.ReactElement<Record<string, unknown>>;
  return [element, ...nodes(element.props.children as React.ReactNode)];
}
beforeEach(() => { (globalThis as typeof globalThis & { React: typeof React }).React = React; });
describe("Discover result presentation", () => {
  it.each([[8.86, 200, "8.9"], [0, 1, "0.0"], [10, 1, "10.0"], [11, 1, null], [-1, 1, null], [NaN, 1, null], [8, 0, null], [8, Infinity, null], [null, 10, null], [9, null, null]] as const)("uses honest rating fallbacks", (voteAverage, voteCount, expected) => {
    expect(showRating({ voteAverage, voteCount })).toBe(expected);
  });
  it("keeps an unadded poster noninteractive, synopsis intact and one Add command", () => {
    const onAdd = vi.fn();
    const tree = nodes(ShowResultCard({ show, added: false, pending: false, faded: false, onAdd }));
    expect(tree.filter((node) => node.props.href)).toHaveLength(0);
    const button = tree.find((node) => node.props["aria-label"] === "Add Dark")!;
    (button.props.onClick as () => void)(); expect(onAdd).toHaveBeenCalledOnce();
    expect(tree.find((node) => node.props.text === "Complete synopsis.")).toBeDefined();
    expect(tree.some((node) => node.props.children === "2017")).toBe(true);
  });
  it("reserves a disabled pending command and preserves card geometry", () => {
    const tree = nodes(ShowResultCard({ show, added: false, pending: true, faded: false, onAdd: vi.fn() }));
    expect(tree.find((node) => node.props["aria-label"] === "Adding Dark")?.props).toMatchObject({ disabled: true, "aria-busy": true });
    expect(tree.some((node) => String(node.props.className).includes("aspect-[2/3]"))).toBe(true);
  });
  it("offers Track on added cards, with shared fading and no duplicate In library control", () => {
    const tree = nodes(ShowResultCard({ show, added: true, pending: false, faded: true, onAdd: vi.fn() }));
    expect(tree[0].props.className).toContain("focus-within:opacity-100");
    expect(tree.some((node) => node.props.href === "/shows/10")).toBe(true);
    expect(tree.filter((node) => Array.isArray(node.props.children) && node.props.children.includes("Track"))).toHaveLength(1);
    expect(tree.some((node) => node.props.children === "In library")).toBe(false);
    expect(tree.some((node) => node.props["aria-label"] === "Add Dark")).toBe(false);
  });
  it("validates date-only premiere years and handles missing art, synopsis and ratings", () => {
    const tree = nodes(ShowResultCard({ show: { ...show, firstAirDate: "2017-02-30", posterPath: null, overview: null, voteCount: 0 }, added: false, pending: false, faded: false, onAdd: vi.fn() }));
    expect(tree.some((node) => node.props.children === "Year unknown")).toBe(true);
    expect(tree.some((node) => node.props["aria-label"] === "Not rated")).toBe(true);
    expect(tree.some((node) => node.props["aria-label"] === "No poster available")).toBe(true);
    expect(tree.some((node) => node.props.text === "No overview available.")).toBe(true);
  });
});

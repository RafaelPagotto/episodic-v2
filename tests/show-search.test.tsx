import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ShowSearch } from "../features/search/components/show-search";
import { forgetSearchResults } from "../features/search/search-session";
import { DEFAULT_USER_PREFERENCES } from "../features/preferences/defaults";

const hooks = vi.hoisted(() => ({ index: 0, states: [] as unknown[], deps: undefined as readonly unknown[] | undefined, cleanup: undefined as (() => void) | undefined, effects: [] as Array<() => void | (() => void)> }));
const navigation = vi.hoisted(() => ({ href: "http://localhost/search" }));
const fetchMock = vi.hoisted(() => vi.fn());
const add = vi.hoisted(() => vi.fn());
const replaceState = vi.hoisted(() => vi.fn());
const pushState = vi.hoisted(() => vi.fn());
vi.mock("react", async () => ({
  ...await vi.importActual<typeof import("react")>("react"),
  useState: (initial: unknown) => {
    const i = hooks.index++;
    if (!(i in hooks.states)) hooks.states[i] = typeof initial === "function" ? (initial as () => unknown)() : initial;
    return [hooks.states[i], (next: unknown) => { hooks.states[i] = typeof next === "function" ? (next as (current: unknown) => unknown)(hooks.states[i]) : next; }];
  },
  useEffect: (effect: () => void | (() => void), deps: readonly unknown[]) => {
    if (!hooks.deps || deps.some((v, i) => !Object.is(v, hooks.deps![i]))) {
      hooks.cleanup?.(); hooks.deps = deps; hooks.effects.push(effect);
    }
  },
  useTransition: () => [false, (callback: () => void) => callback()],
}));
vi.mock("next/navigation", () => ({ usePathname: () => new URL(navigation.href).pathname, useSearchParams: () => new URL(navigation.href).searchParams }));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("next/link", () => ({ default: () => null }));
vi.mock("@/components/ui/button", () => ({ Button: () => null }));
vi.mock("@/components/ui/card", () => ({ Card: () => null, CardContent: () => null }));
vi.mock("@/components/ui/empty-state", () => ({ EmptyState: () => null }));
vi.mock("@/components/ui/notice", () => ({ Notice: () => null }));
vi.mock("@/components/ui/action-feedback", () => ({ ACTION_FEEDBACK_AUTO_DISMISS_MS: 3000, ActionFeedback: () => null }));
vi.mock("@/components/tmdb-attribution", () => ({ TmdbAttribution: () => null }));
vi.mock("@/features/preferences/view-model", async () => vi.importActual("../features/preferences/view-model"));
vi.mock("@/features/shows", () => ({ getShowDetailHref: (id: number) => `/shows/${id}` }));
vi.mock("@/lib/tmdb/images", () => ({ getTmdbImageUrl: () => null }));
vi.mock("@/lib/utils", () => ({ cn: (...v: unknown[]) => v.filter(Boolean).join(" ") }));
vi.mock("../features/search/actions", () => ({ addShowToLibraryAction: add }));
const result = { tmdbId: 253, title: "Star Trek", posterPath: null, firstAirDate: "1966-09-08", originalLanguage: "en", overview: "A test synopsis." };
function nodes(node: React.ReactNode): React.ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!React.isValidElement(node)) return [];
  const element = node as React.ReactElement<Record<string, unknown>>;
  return [element, ...nodes(element.props.children as React.ReactNode)];
}
function render(ids: number[] = [], preferences = DEFAULT_USER_PREFERENCES) {
  hooks.index = 0;
  const tree = ShowSearch({ initialAddedShowIds: ids, preferences });
  for (const effect of hooks.effects.splice(0)) hooks.cleanup = effect() || undefined;
  return tree;
}
function input(tree: React.ReactNode) { return nodes(tree).find((n) => n.type === "input")!; }
function submit(tree: React.ReactNode, query: string) {
  (input(tree).props.onChange as (e: unknown) => void)({ target: { value: query } });
  const fresh = render();
  (nodes(fresh).find((n) => n.type === "form")!.props.onSubmit as (e: unknown) => void)({ preventDefault: vi.fn() });
}
async function settle() { for (let i = 0; i < 8; i++) await Promise.resolve(); }
function resetMount() { hooks.cleanup?.(); hooks.states = []; hooks.deps = undefined; hooks.cleanup = undefined; hooks.effects = []; }

describe("Search restoration and request safety", () => {
  beforeEach(() => {
    (globalThis as typeof globalThis & { React: typeof React }).React = React;
    resetMount(); navigation.href = "http://localhost/search";
    fetchMock.mockReset(); add.mockReset(); replaceState.mockReset(); pushState.mockReset();
    forgetSearchResults("Star Trek"); forgetSearchResults("Other");
    replaceState.mockImplementation((_data: unknown, _unused: string, href: string) => { navigation.href = new URL(href, navigation.href).href; });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("window", { history: { replaceState, pushState }, location: { hash: "#results" } });
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ results: [result] }) });
  });
  afterEach(() => { resetMount(); vi.unstubAllGlobals(); });
  it("submits through replaceState, preserves other parameters and restores results on return with fresh membership", async () => {
    navigation.href += "?source=nav";
    submit(render(), " Star Trek "); render(); await settle();
    expect(replaceState).toHaveBeenCalledWith(null, "", "/search?source=nav&q=Star+Trek#results");
    expect(pushState).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    resetMount(); render([253]);
    const tree = render([253]);
    expect(input(tree).props.value).toBe("Star Trek");
    expect(nodes(tree).some((n) => n.props.href === "/shows/253")).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(add).not.toHaveBeenCalled();
  });
  it("does not change the URL while typing and removes q for a blank submission", () => {
    const tree = render();
    (input(tree).props.onChange as (e: unknown) => void)({ target: { value: "draft" } });
    expect(replaceState).not.toHaveBeenCalled();
    navigation.href = "http://localhost/search?source=nav&q=Star+Trek";
    submit(render(), " ");
    expect(replaceState).toHaveBeenLastCalledWith(null, "", "/search?source=nav#results");
  });
  it("refreshes the same query when explicitly submitted again", async () => {
    navigation.href += "?q=Star+Trek";
    render(); await settle(); submit(render(), "Star Trek"); render(); await settle();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("aborts older searches and ignores late results", async () => {
    let resolve!: (value: unknown) => void;
    fetchMock.mockReturnValueOnce(new Promise((complete) => { resolve = complete; }));
    navigation.href += "?q=Star+Trek"; render();
    const signal = fetchMock.mock.calls[0][1].signal as AbortSignal;
    navigation.href = "http://localhost/search?q=Other"; render(); await settle();
    expect(signal.aborted).toBe(true);
    resolve({ ok: true, json: async () => ({ results: [] }) }); await settle();
    expect(nodes(render()).some((n) => n.props.children === "Star Trek")).toBe(true);
  });
  it("shows failures and retries instead of caching them", async () => {
    fetchMock.mockRejectedValueOnce(new Error("Search unavailable"));
    navigation.href += "?q=Star+Trek"; render(); await settle();
    expect(nodes(render()).some((n) => n.props.children === "Search unavailable")).toBe(true);
    submit(render(), "Star Trek"); render(); await settle();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("passes the full synopsis to the text toggle without a separate disclosure control", async () => {
    const overview = "Twenty years after modern civilization has been destroyed, two survivors travel together across the country. ".repeat(4);
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ results: [{ ...result, overview }] }) });
    navigation.href += "?q=Star+Trek";
    render(); await settle();
    const tree = render();
    const synopsis = nodes(tree).find((node) => node.props.text === overview);
    expect(synopsis).toBeDefined();
    expect(synopsis?.props.showTitle).toBe("Star Trek");
    expect(nodes(tree).some((node) => node.type === "details" || node.type === "summary")).toBe(false);
  });

  it("keeps the fallback for missing synopses visible", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ results: [{ ...result, overview: "" }] }) });
    navigation.href += "?q=Star+Trek";
    render(); await settle();
    expect(nodes(render()).some((node) => node.props.text === "No overview available.")).toBe(true);
  });

  it("fades the whole added card and respects the fade preference", async () => {
    navigation.href += "?q=Star+Trek";
    render([253]); await settle();
    const tree = render([253]);
    const fadedCard = nodes(tree).find((node) => String(node.props.className).includes("opacity-50"));
    expect(fadedCard?.props.className).toContain("hover:opacity-100");
    expect(fadedCard?.props.className).toContain("focus-within:opacity-100");
    expect(nodes(fadedCard).some((node) => node.props.showTitle === "Star Trek")).toBe(true);
    const unfaded = render([253], { ...DEFAULT_USER_PREFERENCES, fadeAdded: false });
    expect(nodes(unfaded).some((node) => String(node.props.className).includes("opacity-50"))).toBe(false);
  });

  it("keeps add feedback as a toast even when preferences hide the newly added card", async () => {
    navigation.href += "?q=Star+Trek";
    render(); await settle();
    add.mockResolvedValue({ status: "success", message: "Star Trek added to your library." });
    const addButton = nodes(render()).find((node) => node.props.children && Array.isArray(node.props.children) && node.props.children.includes("Add"))!;
    (addButton.props.onClick as () => void)();
    await settle();
    const tree = render([], { ...DEFAULT_USER_PREFERENCES, hideAdded: true });
    const feedback = nodes(tree).find((node) => node.props.children === "Star Trek added to your library.");
    expect(feedback?.props.presentation).toBe("toast");
    expect(feedback?.props.dismissible).toBe(true);
    expect(nodes(tree).some((node) => node.props.children === "Star Trek")).toBe(false);
  });
});

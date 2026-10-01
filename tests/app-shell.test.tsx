import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppShell } from "../components/app-shell";
import { SIDEBAR_STATE_STORAGE_KEY } from "../lib/constants";

const hooks = vi.hoisted(() => ({
  index: 0,
  states: [] as unknown[],
  mounted: false,
  effects: [] as Array<() => void>,
}));

vi.mock("react", async () => ({
  ...await vi.importActual<typeof import("react")>("react"),
  useState: (initial: unknown) => {
    const index = hooks.index++;
    if (!(index in hooks.states)) hooks.states[index] = initial;
    return [hooks.states[index], (next: unknown) => { hooks.states[index] = next; }];
  },
  useEffect: (effect: () => void) => {
    if (!hooks.mounted) hooks.effects.push(effect);
  },
}));
vi.mock("@/components/app-navigation", () => ({ AppNavigation: () => null }));
vi.mock("@/lib/constants", async () => vi.importActual("../lib/constants"));

function render(children: React.ReactNode = "Dashboard") {
  hooks.index = 0;
  return AppShell({ children, userEmail: "rafael@example.com" });
}

function navigation(tree: ReturnType<typeof render>) {
  return React.Children.toArray(tree.props.children)[0] as React.ReactElement<{
    collapsed: boolean;
    onToggleSidebar: () => void;
    userEmail: string;
  }>;
}

function mount() {
  render();
  for (const effect of hooks.effects.splice(0)) effect();
  hooks.mounted = true;
  return render();
}

describe("persisted sidebar state", () => {
  let saved: Map<string, string>;
  let getItem: ReturnType<typeof vi.fn>;
  let setItem: ReturnType<typeof vi.fn>;

  function resetHooks() {
    hooks.index = 0;
    hooks.states = [];
    hooks.mounted = false;
    hooks.effects = [];
  }

  beforeEach(() => {
    (globalThis as typeof globalThis & { React: typeof React }).React = React;
    resetHooks();
    saved = new Map();
    getItem = vi.fn((key: string) => saved.get(key) ?? null);
    setItem = vi.fn((key: string, value: string) => { saved.set(key, value); });
    vi.stubGlobal("window", { localStorage: { getItem, setItem } });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("defaults to collapsed before hydration and when no preference exists", () => {
    expect(navigation(render()).props.collapsed).toBe(true);
    expect(navigation(mount()).props.collapsed).toBe(true);
    expect(getItem).toHaveBeenCalledWith(SIDEBAR_STATE_STORAGE_KEY);
    expect(setItem).not.toHaveBeenCalled();
  });

  it.each([
    ["expanded", false],
    ["collapsed", true],
    ["invalid", true],
  ])("restores %s without overwriting the saved preference", (value, collapsed) => {
    saved.set(SIDEBAR_STATE_STORAGE_KEY, value);
    const tree = mount();
    expect(navigation(tree).props.collapsed).toBe(collapsed);
    expect(tree.props.style["--sidebar-width"]).toBe(collapsed ? "4.5rem" : "16rem");
    expect(setItem).not.toHaveBeenCalled();
  });

  it("saves both toggle choices and restores them on a fresh mount", () => {
    navigation(mount()).props.onToggleSidebar();
    expect(saved.get(SIDEBAR_STATE_STORAGE_KEY)).toBe("expanded");
    expect(navigation(render()).props.collapsed).toBe(false);
    resetHooks();
    expect(navigation(mount()).props.collapsed).toBe(false);
    navigation(render()).props.onToggleSidebar();
    expect(saved.get(SIDEBAR_STATE_STORAGE_KEY)).toBe("collapsed");
    resetHooks();
    expect(navigation(mount()).props.collapsed).toBe(true);
  });

  it("preserves the choice as page content changes and leaves other preferences alone", () => {
    saved.set("episodic.library.view-mode", "list");
    navigation(mount()).props.onToggleSidebar();
    const nextPage = render("Library");
    expect(navigation(nextPage).props.collapsed).toBe(false);
    expect(saved.get("episodic.library.view-mode")).toBe("list");
    expect(setItem).toHaveBeenCalledTimes(1);
  });

  it("remains usable when reading or writing browser storage is blocked", () => {
    getItem.mockImplementation(() => { throw new Error("blocked"); });
    setItem.mockImplementation(() => { throw new Error("blocked"); });
    expect(navigation(mount()).props.collapsed).toBe(true);
    expect(() => navigation(render()).props.onToggleSidebar()).not.toThrow();
    expect(navigation(render()).props.collapsed).toBe(false);
    expect(() => navigation(render()).props.onToggleSidebar()).not.toThrow();
    expect(navigation(render()).props.collapsed).toBe(true);
  });
});

import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const hooks = vi.hoisted(() => ({
  index: 0,
  states: [] as unknown[],
  effects: [] as Array<() => void | (() => void)>,
  element: { scrollHeight: 100 },
  resize: undefined as (() => void) | undefined,
  disconnect: vi.fn(),
}));
vi.mock("react", async () => ({
  ...await vi.importActual<typeof import("react")>("react"),
  useState: (initial: unknown) => {
    const index = hooks.index++;
    if (!(index in hooks.states)) hooks.states[index] = initial;
    return [hooks.states[index], (next: unknown) => { hooks.states[index] = typeof next === "function" ? (next as (current: unknown) => unknown)(hooks.states[index]) : next; }];
  },
  useRef: () => ({ current: hooks.element }),
  useEffect: (effect: () => void | (() => void)) => { hooks.effects.push(effect); },
}));
vi.mock("@/lib/utils", () => ({ cn: (...values: unknown[]) => values.filter(Boolean).join(" ") }));
import { SearchSynopsis } from "../features/search/components/search-synopsis";

function render() {
  hooks.index = 0;
  return SearchSynopsis({ text: "A complete synopsis.", showTitle: "Example" });
}

describe("Search synopsis text toggle", () => {
  beforeEach(() => {
    (globalThis as typeof globalThis & { React: typeof React }).React = React;
    hooks.states = []; hooks.effects = []; hooks.element.scrollHeight = 100;
    hooks.disconnect.mockReset();
    vi.stubGlobal("getComputedStyle", () => ({ lineHeight: "20px" }));
    vi.stubGlobal("requestAnimationFrame", (callback: () => void) => { callback(); return 1; });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    vi.stubGlobal("document", {});
    vi.stubGlobal("ResizeObserver", class { constructor(callback: () => void) { hooks.resize = callback; } observe() {} disconnect() { hooks.disconnect(); } });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("limits the preview to three lines and toggles by clicking the text", () => {
    render(); hooks.effects[0]();
    let tree = render();
    let button = tree.props.children as React.ReactElement<Record<string, unknown>>;
    expect(button.type).toBe("button");
    expect(button.props["aria-expanded"]).toBe(false);
    expect((button.props.children as React.ReactElement<Record<string, unknown>>).props.className).toContain("line-clamp-3");
    expect(button.props.type).toBe("button");
    (button.props.onClick as () => void)();
    tree = render(); button = tree.props.children as React.ReactElement<Record<string, unknown>>;
    expect(button.props["aria-expanded"]).toBe(true);
    expect((button.props.children as React.ReactElement<Record<string, unknown>>).props.className).not.toContain("line-clamp");
    (button.props.onClick as () => void)();
    expect((render().props.children as React.ReactElement<Record<string, unknown>>).props["aria-expanded"]).toBe(false);
  });

  it("leaves short text noninteractive and recalculates overflow after resizing", () => {
    hooks.element.scrollHeight = 60;
    render(); const cleanup = hooks.effects[0]();
    expect((render().props.children as React.ReactElement).type).toBe("span");
    hooks.element.scrollHeight = 100;
    hooks.resize?.();
    const button = render().props.children as React.ReactElement<Record<string, unknown>>;
    (button.props.onClick as () => void)();
    hooks.element.scrollHeight = 40;
    hooks.resize?.();
    expect((render().props.children as React.ReactElement).type).toBe("span");
    expect(hooks.states[0]).toBe(false);
    (cleanup as () => void)();
    expect(hooks.disconnect).toHaveBeenCalledOnce();
  });
});

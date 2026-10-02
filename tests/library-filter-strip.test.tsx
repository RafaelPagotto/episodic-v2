import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LibraryFilterStrip } from "../features/library/components/library-filter-strip";

const hooks = vi.hoisted(() => ({ state: undefined as unknown, index: 0, refs: [] as unknown[], effect: undefined as (() => void | (() => void)) | undefined, mounted: false }));
vi.mock("react", async () => ({
  ...await vi.importActual<typeof import("react")>("react"),
  useState: (initial: unknown) => [hooks.state ?? initial, (state: unknown) => { hooks.state = state; }],
  useRef: () => hooks.refs[hooks.index++],
  useEffect: (effect: () => void | (() => void)) => { if (!hooks.mounted) hooks.effect = effect; },
}));
vi.mock("@/components/ui/button", () => ({ Button: () => null }));
function elements(node: React.ReactNode): React.ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!React.isValidElement(node)) return [];
  const element = node as React.ReactElement<Record<string, unknown>>;
  return [element, ...elements(element.props.children as React.ReactNode)];
}
function render() {
  hooks.index = 0;
  return LibraryFilterStrip({ children: <button>Favourites</button> });
}
function button(tree: React.ReactNode, direction: "left" | "right") {
  return elements(tree).find((e) => e.props["aria-label"] === `Scroll filters ${direction}`)!;
}
describe("Library filter strip mouse access", () => {
  let resize: () => void;
  let cleanup: (() => void) | void;
  let scrollListener: () => void;
  let wrapper: { clientWidth: number };
  let strip: { clientWidth: number; scrollWidth: number; scrollLeft: number; scrollBy: ReturnType<typeof vi.fn>; addEventListener: ReturnType<typeof vi.fn>; removeEventListener: ReturnType<typeof vi.fn> };
  const disconnect = vi.fn();
  beforeEach(() => {
    (globalThis as typeof globalThis & { React: typeof React }).React = React;
    hooks.state = undefined; hooks.index = 0; hooks.effect = undefined; hooks.mounted = false;
    wrapper = { clientWidth: 383 };
    strip = {
      clientWidth: 287, scrollWidth: 672, scrollLeft: 0,
      scrollBy: vi.fn(({ left }: { left: number }) => {
        strip.scrollLeft = Math.max(0, Math.min(strip.scrollWidth - strip.clientWidth, strip.scrollLeft + left));
        scrollListener();
      }),
      addEventListener: vi.fn((_name: string, listener: () => void) => { scrollListener = listener; }),
      removeEventListener: vi.fn(),
    };
    hooks.refs = [{ current: wrapper }, { current: strip }];
    disconnect.mockReset();
    vi.stubGlobal("ResizeObserver", class {
      constructor(callback: () => void) { resize = callback; }
      observe = vi.fn();
      disconnect = disconnect;
    });
    render(); cleanup = hooks.effect!(); hooks.mounted = true;
  });
  afterEach(() => { cleanup?.(); vi.unstubAllGlobals(); });
  it("scrolls to hidden filters with clicks and disables arrows at each end", () => {
    let tree = render();
    expect(button(tree, "left").props.disabled).toBe(true);
    expect(button(tree, "right").props.disabled).toBe(false);
    for (let i = 0; i < 2; i++) {
      (button(tree, "right").props.onClick as () => void)(); tree = render();
    }
    expect(strip.scrollLeft).toBe(385);
    expect(button(tree, "right").props.disabled).toBe(true);
    expect(button(tree, "left").props.disabled).toBe(false);
    for (let i = 0; i < 2; i++) {
      (button(tree, "left").props.onClick as () => void)(); tree = render();
    }
    expect(strip.scrollLeft).toBe(0);
    expect(button(tree, "left").props.disabled).toBe(true);
  });
  it("removes controls when filters fit and restores them after resizing smaller", () => {
    wrapper.clientWidth = 701; strip.clientWidth = 701; resize();
    expect(button(render(), "right")).toBeUndefined();
    wrapper.clientWidth = 383; strip.clientWidth = 287; resize();
    expect(button(render(), "right").props.disabled).toBe(false);
  });
  it("tracks wheel/touch scrolling and cleans up observers on unmount", () => {
    strip.scrollLeft = 385; scrollListener();
    expect(button(render(), "right").props.disabled).toBe(true);
    cleanup?.(); cleanup = undefined;
    expect(disconnect).toHaveBeenCalledOnce();
    expect(strip.removeEventListener).toHaveBeenCalledWith("scroll", scrollListener);
  });
});

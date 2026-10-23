import { afterEach, describe, expect, it, vi } from "vitest";
import { updateDiscoverHistory } from "../features/discover/history";

afterEach(() => vi.unstubAllGlobals());

describe("Discover native history integration", () => {
  it.each(["pushState", "replaceState"] as const)("%s notifies Next instead of bypassing its URL update", (method) => {
    const original = { __NA: true, _N: true, __PRIVATE_NEXTJS_INTERNALS_TREE: ["router-tree"], unrelated: { position: 42 } };
    const restore = vi.fn();
    const write = vi.fn((state: Record<string, unknown>, _unused: string, href: string) => {
      // Match the real App Router guard, which the old browser fixture omitted.
      if (state.__NA || state._N) return;
      restore(href);
      Object.assign(state, { __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: original.__PRIVATE_NEXTJS_INTERNALS_TREE });
    });
    vi.stubGlobal("window", { history: { state: original, [method]: write } });

    updateDiscoverHistory(method, "/discover?feed=popular&page=2&q=dark#results");

    expect(restore).toHaveBeenCalledTimes(1);
    expect(restore).toHaveBeenCalledWith("/discover?feed=popular&page=2&q=dark#results");
    expect(write.mock.calls[0][0]).toEqual({ unrelated: { position: 42 }, __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: ["router-tree"] });
    expect(original).toEqual({ __NA: true, _N: true, __PRIVATE_NEXTJS_INTERNALS_TREE: ["router-tree"], unrelated: { position: 42 } });
  });

  it("handles an initial entry without history state", () => {
    const pushState = vi.fn();
    vi.stubGlobal("window", { history: { state: null, pushState } });
    updateDiscoverHistory("pushState", "/discover?q=dark");
    expect(pushState).toHaveBeenCalledWith({}, "", "/discover?q=dark");
  });
});

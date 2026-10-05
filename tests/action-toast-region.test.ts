import { afterEach, describe, expect, it, vi } from "vitest";
import { acquireActionToastRegion } from "../components/ui/action-toast-region";

describe("action toast region", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("shares one overlay between notifications and removes it after the last unmount", () => {
    const element = { className: "", setAttribute: vi.fn(), remove: vi.fn() };
    const createElement = vi.fn(() => element);
    const appendChild = vi.fn();
    vi.stubGlobal("document", { createElement, body: { appendChild } });
    const first = acquireActionToastRegion();
    const second = acquireActionToastRegion();
    expect(first.element).toBe(second.element);
    expect(appendChild).toHaveBeenCalledTimes(1);
    first.release();
    expect(element.remove).not.toHaveBeenCalled();
    second.release();
    expect(element.remove).toHaveBeenCalledTimes(1);
    const remounted = acquireActionToastRegion();
    expect(createElement).toHaveBeenCalledTimes(2);
    remounted.release();
  });
});

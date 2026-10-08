import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const hooks = vi.hoisted(() => ({ setters: [] as Array<ReturnType<typeof vi.fn>> }));
const scripts = vi.hoisted(() => ({ callbacks: [] as Array<{ onLoad: () => void; onReady: () => void; onError: () => void }> }));
vi.mock("react", async () => ({
  ...await vi.importActual<typeof import("react")>("react"),
  useState: (initial: unknown) => {
    const setter = vi.fn();
    hooks.setters.push(setter);
    return [initial, setter];
  },
}));
vi.mock("react-dom", () => ({ useFormStatus: () => ({ pending: false }) }));
vi.mock("next/script", () => ({ default: (props: typeof scripts.callbacks[number]) => {
  scripts.callbacks.push(props);
  return null;
} }));

import { Turnstile } from "../features/auth/components/turnstile";

describe("Turnstile script readiness", () => {
  beforeEach(() => {
    (globalThis as typeof globalThis & { React: typeof React }).React = React;
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "public-test-site-key");
    hooks.setters = [];
    scripts.callbacks = [];
  });
  afterEach(() => vi.unstubAllEnvs());

  it("initializes both concurrent forms when Next.js deduplicates the script", () => {
    renderToStaticMarkup(<><Turnstile /><Turnstile /></>);
    expect(scripts.callbacks).toHaveLength(2);
    // Next.js invokes onReady for the first load, but only onLoad for its shared promise.
    scripts.callbacks[0].onReady();
    scripts.callbacks[1].onLoad();
    expect(hooks.setters[0]).toHaveBeenCalledWith(true);
    expect(hooks.setters[4]).toHaveBeenCalledWith(true);
  });

  it("initializes a remounted form from an already loaded script", () => {
    renderToStaticMarkup(<Turnstile />);
    scripts.callbacks[0].onReady();
    expect(hooks.setters[0]).toHaveBeenCalledWith(true);
  });

  it("reports script load failures without making the widget ready", () => {
    renderToStaticMarkup(<Turnstile />);
    scripts.callbacks[0].onError();
    expect(hooks.setters[2]).toHaveBeenCalledWith(true);
    expect(hooks.setters[0]).not.toHaveBeenCalled();
  });
});

import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DemoEntry } from "../features/guest/components/demo-entry";
import { GuestControls } from "../features/guest/components/guest-controls";
import type { AuthFormState } from "../features/auth/state";

const hooks = vi.hoisted(() => ({ pending: false, state: { status: "idle" } as AuthFormState, actions: [] as unknown[] }));
const actions = vi.hoisted(() => ({ start: vi.fn(), reset: vi.fn(), exit: vi.fn() }));
vi.mock("react", async () => ({
  ...await vi.importActual<typeof import("react")>("react"),
  useActionState: (action: unknown) => { hooks.actions.push(action); return [hooks.state, action]; },
}));
vi.mock("react-dom", () => ({ useFormStatus: () => ({ pending: hooks.pending }) }));
vi.mock("next/script", () => ({ default: () => null }));
vi.mock("../features/guest/actions", () => ({ startGuestDemoAction: actions.start, resetGuestDemoAction: actions.reset, exitGuestDemoAction: actions.exit }));
vi.mock("@/features/auth/state", async () => vi.importActual("../features/auth/state"));
vi.mock("@/features/auth/components/auth-submit-button", async () => vi.importActual("../features/auth/components/auth-submit-button"));
vi.mock("@/features/auth/components/turnstile", async () => vi.importActual("../features/auth/components/turnstile"));
vi.mock("@/features/auth/components/auth-field", () => ({ AuthField: ({ label, name }: { label: string; name: string }) => <label>{label}<input name={name} /></label> }));
vi.mock("@/features/auth/components/auth-form-message", () => ({ AuthFormMessage: ({ state }: { state: AuthFormState }) => state.message ? <p role={state.status === "error" ? "alert" : "status"}>{state.message}</p> : null }));
vi.mock("@/components/ui/button", () => ({ Button: ({ variant: _variant, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string }) => { void _variant; return <button {...props} />; } }));

describe("guest demo controls", () => {
  beforeEach(() => { (globalThis as typeof globalThis & { React: typeof React }).React = React; hooks.pending = false; hooks.state = { status: "idle", message: "" }; hooks.actions = []; });
  it("renders secondary entry bound to the guest action with lifetime information", () => {
    const html = renderToStaticMarkup(<DemoEntry />);
    expect(html).toContain("Try demo"); expect(html).toContain("72 hours"); expect(html).toContain('name="timeZone"');
    expect(hooks.actions).toContain(actions.start);
  });
  it("shows resume/exit for an existing session and preserves exit when entry is disabled", () => {
    expect(renderToStaticMarkup(<DemoEntry hasGuestSession />)).toContain("Resume demo");
    const html = renderToStaticMarkup(<DemoEntry hasGuestSession enabled={false} />);
    expect(html).toContain("Exit demo"); expect(html).not.toContain("Resume demo");
  });
  it("shows pending feedback with a disabled button", () => {
    hooks.pending = true;
    const html = renderToStaticMarkup(<DemoEntry />);
    expect(html).toContain("Preparing demo..."); expect(html).toContain("disabled");
  });
  it.each(["error", "success"] as const)("announces %s feedback", (status) => {
    hooks.state = { status, message: status === "error" ? "The demo is unavailable right now." : "Demo restored." };
    const html = renderToStaticMarkup(<DemoEntry />);
    expect(html).toContain(hooks.state.message); expect(html).toContain(`role="${status === "error" ? "alert" : "status"}"`);
  });
  it("displays timezone-local expiry and typed reset safeguard bound to the proper actions", () => {
    const html = renderToStaticMarkup(<GuestControls expiresAt="2026-10-10T12:00:00Z" timeZone="America/Sao_Paulo" />);
    expect(html).toContain("Guest demo"); expect(html).toContain("America/Sao_Paulo"); expect(html).toContain("9:00 AM");
    expect(html).toContain("RESET DEMO"); expect(html).toContain("expiration stay unchanged");
    expect(hooks.actions).toContain(actions.reset); expect(hooks.actions).toContain(actions.exit);
  });
});

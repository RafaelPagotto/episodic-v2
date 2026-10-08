import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthFormState } from "../features/auth/state";

const hooks = vi.hoisted(() => ({ setters: [] as Array<ReturnType<typeof vi.fn>> }));
const actions = vi.hoisted(() => ({ signIn: vi.fn(), start: vi.fn(), exit: vi.fn() }));
vi.mock("react", async () => ({
  ...await vi.importActual<typeof import("react")>("react"),
  useState: (initial: unknown) => {
    const setter = vi.fn();
    hooks.setters.push(setter);
    return [initial, setter];
  },
  useRef: (initial: unknown) => ({ current: initial }),
  useCallback: (callback: unknown) => callback,
  useActionState: (action: unknown, state: unknown) => [state, action],
}));
vi.mock("react-dom", () => ({ useFormStatus: () => ({ pending: false }), flushSync: (callback: () => void) => callback() }));
vi.mock("next/script", () => ({ default: () => null }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props}>{children}</a> }));
vi.mock("@/features/auth/actions", () => ({ signInAction: actions.signIn }));
vi.mock("../features/guest/actions", () => ({ startGuestDemoAction: actions.start, exitGuestDemoAction: actions.exit }));
vi.mock("@/features/auth/state", async () => vi.importActual("../features/auth/state"));
vi.mock("../features/auth/components/auth-form-message", () => ({ AuthFormMessage: ({ state }: { state: AuthFormState }) => state.message ? <p role={state.status === "error" ? "alert" : "status"}>{state.message}</p> : null }));
vi.mock("@/features/auth/components/auth-form-message", () => vi.importMock("../features/auth/components/auth-form-message"));
vi.mock("@/features/auth/components/auth-submit-button", async () => vi.importActual("../features/auth/components/auth-submit-button"));
vi.mock("@/features/auth/components/auth-field", async () => vi.importActual("../features/auth/components/auth-field"));
vi.mock("@/features/auth/components/shared-auth-captcha", async () => vi.importActual("../features/auth/components/shared-auth-captcha"));
vi.mock("@/components/ui/button", () => ({ Button: ({ variant: _variant, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string }) => { void _variant; return <button {...props} />; } }));
vi.mock("@/components/ui/input", () => ({ Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} /> }));
vi.mock("@/components/ui/label", () => ({ Label: (props: React.LabelHTMLAttributes<HTMLLabelElement>) => <label {...props} /> }));
vi.mock("@/lib/utils", async () => vi.importActual("../lib/utils"));

import { SharedAuthCaptcha } from "../features/auth/components/shared-auth-captcha";
import { SignInForm } from "../features/auth/components/sign-in-form";
import { DemoEntry } from "../features/guest/components/demo-entry";

type CaptchaController = {
  onTokenChange: (value: string) => void;
  submit: (action: (state: AuthFormState, data: FormData) => Promise<AuthFormState>, state: AuthFormState, data: FormData) => Promise<AuthFormState>;
};
const idle: AuthFormState = { status: "idle", message: "" };

function controller() {
  const element = SharedAuthCaptcha({ children: null });
  return element.props.value as CaptchaController;
}

describe("shared sign-in/demo CAPTCHA", () => {
  beforeEach(() => {
    (globalThis as typeof globalThis & { React: typeof React }).React = React;
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "public-test-site-key");
    hooks.setters = [];
  });
  afterEach(() => vi.unstubAllEnvs());

  it("renders one widget and two independent forms, without guest credential fields", () => {
    const html = renderToStaticMarkup(<SharedAuthCaptcha><SignInForm /><DemoEntry /></SharedAuthCaptcha>);
    expect(html.match(/aria-label="Security check"/g)).toHaveLength(1);
    expect(html.match(/<form /g)).toHaveLength(2);
    expect(html.match(/name="captchaToken"/g)).toHaveLength(2);
    const demo = html.slice(html.lastIndexOf("<form "));
    expect(demo).toContain("Try demo");
    expect(demo).not.toMatch(/name="(?:email|password)"/);
    expect(html).toContain("Forgot password?");
    expect(html).toContain("Create an account");
  });

  it("preserves standalone demo and sign-in when there is no shared provider", () => {
    expect(renderToStaticMarkup(<DemoEntry />).match(/aria-label="Security check"/g)).toHaveLength(1);
    expect(renderToStaticMarkup(<SignInForm />).match(/aria-label="Security check"/g)).toHaveLength(1);
    expect(renderToStaticMarkup(<DemoEntry hasGuestSession />)).not.toContain("Security check");
  });

  it("fails closed on missing or expired tokens even if stale form data contains one", async () => {
    const captcha = controller();
    const action = vi.fn();
    const data = new FormData(); data.set("captchaToken", "stale-token");
    expect((await captcha.submit(action, idle, data)).status).toBe("error");
    captcha.onTokenChange("fresh-token");
    captcha.onTokenChange("");
    expect((await captcha.submit(action, idle, data)).status).toBe("error");
    expect(action).not.toHaveBeenCalled();
  });

  it("passes the selected form's token once and requires a fresh token for retry", async () => {
    const captcha = controller();
    const error: AuthFormState = { status: "error", message: "Unable to sign in." };
    const action = vi.fn().mockResolvedValue(error);
    const data = new FormData(); data.set("email", "qa@example.invalid");
    captcha.onTokenChange("first-token");
    expect(await captcha.submit(action, idle, data)).toEqual(error);
    expect(data.get("captchaToken")).toBe("first-token");
    expect(data.get("email")).toBe("qa@example.invalid");
    expect(hooks.setters[1].mock.calls).toEqual([[true], [false]]);
    expect(hooks.setters[2]).toHaveBeenCalledTimes(1);
    await captcha.submit(action, idle, data);
    expect(action).toHaveBeenCalledTimes(1);
    captcha.onTokenChange("second-token");
    await captcha.submit(action, idle, data);
    expect(action).toHaveBeenCalledTimes(2);
    expect(data.get("captchaToken")).toBe("second-token");
  });

  it("reserves synchronously, blocks concurrent requests and ignores tokens arriving while pending", async () => {
    const captcha = controller();
    let finish!: (state: AuthFormState) => void;
    const action = vi.fn(() => new Promise<AuthFormState>((resolve) => { finish = resolve; }));
    const other = vi.fn();
    captcha.onTokenChange("single-use-token");
    const first = captcha.submit(action, idle, new FormData());
    expect(hooks.setters[1]).toHaveBeenLastCalledWith(true);
    expect(hooks.setters[2]).not.toHaveBeenCalled();
    expect((await captcha.submit(other, idle, new FormData())).status).toBe("error");
    captcha.onTokenChange("token-during-pending");
    finish({ status: "success", message: "Done." });
    expect((await first).status).toBe("success");
    expect((await captcha.submit(other, idle, new FormData())).status).toBe("error");
    expect(other).not.toHaveBeenCalled();
    expect(action).toHaveBeenCalledTimes(1);
  });

  it("unlocks and requests a fresh challenge after exceptions and redirect responses", async () => {
    const captcha = controller();
    const redirect = new Error("redirect:/library");
    captcha.onTokenChange("token");
    await expect(captcha.submit(vi.fn().mockRejectedValue(redirect), idle, new FormData())).rejects.toBe(redirect);
    expect(hooks.setters[1]).toHaveBeenLastCalledWith(false);
    expect(hooks.setters[2]).toHaveBeenCalledTimes(1);
    captcha.onTokenChange("new-token");
    expect((await captcha.submit(vi.fn().mockResolvedValue({ status: "success" }), idle, new FormData())).status).toBe("success");
  });

  it("allows sign-in without CAPTCHA when it is not configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "");
    const action = vi.fn().mockResolvedValue({ status: "success" });
    expect((await controller().submit(action, idle, new FormData())).status).toBe("success");
    expect(action).toHaveBeenCalledTimes(1);
    expect(renderToStaticMarkup(<SharedAuthCaptcha><SignInForm /></SharedAuthCaptcha>)).not.toContain("Security check");
  });
});

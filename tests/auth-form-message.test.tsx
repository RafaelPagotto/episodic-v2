import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/components/ui/action-feedback", () => ({ ActionFeedback: () => null }));
import { AuthFormMessage } from "../features/auth/components/auth-form-message";

describe("authentication action feedback", () => {
  beforeEach(() => { (globalThis as typeof globalThis & { React: typeof React }).React = React; });

  it("renders nothing before an action produces a message", () => {
    expect(AuthFormMessage({ state: { status: "idle", message: "" } })).toBeNull();
  });

  it.each(["success", "error"] as const)("renders %s as a dismissible toast without expiring account instructions", (status) => {
    const state = { status, message: status === "success" ? "Check your email for the confirmation link." : "Check the highlighted fields." };
    const feedback = AuthFormMessage({ state });
    expect(feedback?.props).toMatchObject({ presentation: "toast", dismissible: true, tone: status, feedbackKey: state, children: state.message });
    expect(feedback?.props.autoDismissMs).toBeUndefined();
  });
});

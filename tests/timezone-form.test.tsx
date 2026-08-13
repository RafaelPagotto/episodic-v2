import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/ui/action-feedback", () => ({
  ACTION_FEEDBACK_AUTO_DISMISS_MS: 5_000,
  ActionFeedback: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));

vi.mock("../features/profile/timezone-actions", () => ({
  updateUserTimeZoneAction: async () => ({ message: "Timezone saved.", status: "success" }),
}));

import { TimeZoneForm } from "../features/profile/components/timezone-form";

describe("profile timezone form", () => {
  it("shows the saved timezone and explains its release-date purpose", () => {
    (globalThis as typeof globalThis & { React: typeof React }).React = React;
    const markup = renderToStaticMarkup(
      <TimeZoneForm persistedTimeZone="America/Sao_Paulo" />,
    );

    expect(markup).toContain("America/Sao_Paulo");
    expect(markup).toContain("Used to determine the local date when episodes become available.");
    expect(markup).toContain("Save timezone");
  });

  it("shows the deterministic UTC fallback before initialization", () => {
    (globalThis as typeof globalThis & { React: typeof React }).React = React;
    const markup = renderToStaticMarkup(<TimeZoneForm persistedTimeZone={null} />);

    expect(markup).toContain("Current setting: UTC fallback");
  });
});

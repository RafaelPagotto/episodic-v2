import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppNavigation } from "../components/app-navigation";
import { APP_NAV_ITEMS } from "../lib/constants";

const pathname = vi.hoisted(() => ({ value: "/library" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.value }));
vi.mock("next/link", () => ({
  default: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props}>{children}</a>,
}));
vi.mock("@/components/brand-logo", () => ({ BrandLogo: () => <svg aria-hidden="true" /> }));
vi.mock("@/features/auth/actions", () => ({ signOutAction: vi.fn() }));
vi.mock("@/lib/constants", async () => vi.importActual("../lib/constants"));
vi.mock("@/lib/utils", async () => vi.importActual("../lib/utils"));
vi.mock("@/components/ui/button", async () => vi.importActual("../components/ui/button"));

function markup(collapsed: boolean, userEmail: string | null = "rafael@example.com") {
  const html = renderToStaticMarkup(<AppNavigation collapsed={collapsed} onToggleSidebar={vi.fn()} userEmail={userEmail} />);
  return {
    desktop: html.match(/<aside[\s\S]*?<\/aside>/)?.[0] ?? "",
    mobile: html.match(/<header[\s\S]*?<\/header>/)?.[0] ?? "",
  };
}

describe("collapsible navigation", () => {
  beforeEach(() => {
    (globalThis as typeof globalThis & { React: typeof React }).React = React;
    pathname.value = "/library";
  });

  it("keeps every collapsed navigation link labelled and shows only the account initial", () => {
    const { desktop } = markup(true);
    for (const item of APP_NAV_ITEMS) {
      expect(desktop).toContain(`href="${item.href}"`);
      expect(desktop).toContain(`aria-label="${item.label}"`);
      expect(desktop).toContain(`<span class="sr-only">${item.label}</span>`);
    }
    expect(desktop).toContain('aria-label="Expand sidebar"');
    expect(desktop).toContain('aria-expanded="false"');
    expect(desktop).toContain('<span aria-hidden="true">R</span>');
    expect(desktop).toContain('<span class="sr-only">Signed in as rafael@example.com</span>');
    expect(desktop).toContain('<span class="sr-only">Sign out</span>');
  });

  it("restores visible labels and account details when expanded", () => {
    const { desktop } = markup(false);
    expect(desktop).toContain('aria-label="Collapse sidebar"');
    expect(desktop).toContain('aria-expanded="true"');
    for (const item of APP_NAV_ITEMS) expect(desktop).toContain(`<span>${item.label}</span>`);
    expect(desktop).toContain('>Signed in as</p>');
    expect(desktop).toContain('>rafael@example.com</p>');
    expect(desktop).toContain('<span>Sign out</span>');
  });

  it("keeps mobile navigation independent of the desktop preference", () => {
    expect(markup(true).mobile).toBe(markup(false).mobile);
  });

  it.each([true, false])("retires Progress and preserves the remaining routes when collapsed=%s", (collapsed) => {
    const { desktop, mobile } = markup(collapsed);
    const expectedRoutes = [
      ["Dashboard", "/dashboard"],
      ["Library", "/library"],
      ["Search", "/search"],
      ["Profile", "/profile"],
    ];
    for (const navigation of [desktop, mobile]) {
      expect(navigation).not.toContain('href="/progress"');
      expect(navigation).not.toContain('aria-label="Progress"');
      for (const [label, href] of expectedRoutes) {
        expect(navigation).toMatch(new RegExp(`<a[^>]*aria-label="${label}"[^>]*href="${href}"`));
      }
    }
  });

  it("preserves active route highlighting for nested pages", () => {
    pathname.value = "/profile/preferences";
    expect(markup(true).desktop).toMatch(/<a[^>]*aria-current="page"[^>]*aria-label="Profile"/);
  });

  it("uses a safe account initial when the email is unavailable", () => {
    expect(markup(true, null).desktop).toContain('<span aria-hidden="true">?</span>');
  });
});

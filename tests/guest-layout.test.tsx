import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ anonymous: true, seededAt: "2026-10-08T00:00:00Z" }));
vi.mock("@/components/app-shell", () => ({ AppShell: () => null }));
vi.mock("@/features/auth/session", () => ({ requireCurrentUser: async () => ({ id: "guest-test", is_anonymous: fixture.anonymous }) }));
vi.mock("@/features/profile/components/timezone-initializer", () => ({ TimeZoneInitializer: () => null }));
vi.mock("@/features/profile/timezone", () => ({ getPersistedUserTimeZone: async () => "America/Sao_Paulo" }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => ({}) }));
vi.mock("@/features/guest/server", () => ({ getGuestSession: async () => ({ expires_at: "2026-10-11T00:00:00Z", seeded_at: fixture.seededAt }) }));
vi.mock("@/features/guest/components/guest-controls", () => ({ GuestControls: () => null }));
vi.mock("@/lib/date-only", () => ({ resolveTimeZone: (value: string) => value }));

import ProtectedAppLayout from "../app/(app)/layout";

describe("guest reset page state", () => {
  beforeEach(() => {
    (globalThis as typeof globalThis & { React: typeof React }).React = React;
    fixture.anonymous = true;
    fixture.seededAt = "2026-10-08T00:00:00Z";
  });

  it("remounts guest page content only when the completed seed changes", async () => {
    const page = <p>Library</p>;
    const first = await ProtectedAppLayout({ children: page });
    const firstContent = first.props.children[1].props.children[1];
    const resumed = await ProtectedAppLayout({ children: page });
    expect(resumed.props.children[1].props.children[1].key).toBe(firstContent.key);
    fixture.seededAt = "2026-10-08T01:00:00Z";
    const reset = await ProtectedAppLayout({ children: page });
    const resetContent = reset.props.children[1].props.children[1];
    expect(resetContent.type).toBe(React.Fragment);
    expect(resetContent.key).not.toBe(firstContent.key);
    expect(resetContent.props.children).toBe(page);
  });

  it("leaves permanent-user page content unchanged", async () => {
    fixture.anonymous = false;
    const page = <p>Library</p>;
    const result = await ProtectedAppLayout({ children: page });
    expect(result.props.children[1].props.children[1]).toBe(page);
  });
});

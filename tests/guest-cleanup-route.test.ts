import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "../app/api/cron/cleanup-guests/route";

const createClient = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/admin", () => ({ createOptionalSupabaseServiceRoleClient: createClient }));
function request(query = "", auth = "Bearer test-cron-secret") {
  const url = new URL(`https://example.invalid/api/cron/cleanup-guests${query}`);
  return { nextUrl: url, headers: new Headers({ authorization: auth }) } as unknown as NextRequest;
}
describe("guest cleanup route", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("CRON_SECRET", "test-cron-secret"); });
  it("authenticates before database access and rejects invalid dry runs", async () => {
    expect((await GET(request("", "bad"))).status).toBe(401);
    expect((await GET(request("?dryRun=0"))).status).toBe(400);
    expect(createClient).not.toHaveBeenCalled();
  });
  it.each([false, true])("passes dryRun=%s to the service-only transaction and returns aggregate counts", async (dryRun) => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ eligible: 3, deleted: dryRun ? 0 : 3, remaining: dryRun ? 3 : 0 }], error: null });
    createClient.mockReturnValue({ rpc });
    const result = await GET(request(dryRun ? "?dryRun=1" : ""));
    expect(result.status).toBe(200); expect(result.headers.get("Cache-Control")).toBe("no-store");
    expect(rpc).toHaveBeenCalledWith("cleanup_guest_accounts", { p_dry_run: dryRun });
    expect(await result.json()).toEqual({ ok: true, dryRun, eligible: 3, deleted: dryRun ? 0 : 3, remaining: dryRun ? 3 : 0 });
  });
  it("returns controlled errors for missing configuration and RPC failures", async () => {
    vi.stubEnv("CRON_SECRET", ""); expect((await GET(request())).status).toBe(503); expect(createClient).not.toHaveBeenCalled();
    vi.stubEnv("CRON_SECRET", "test-cron-secret"); createClient.mockReturnValue(null); expect((await GET(request())).status).toBe(503);
    createClient.mockReturnValue({ rpc: vi.fn().mockResolvedValue({ data: null, error: { message: "private credential" } }) });
    const result = await GET(request()); expect(result.status).toBe(500); expect(await result.text()).not.toContain("private credential");
  });
});

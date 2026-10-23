import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ client: { auth: { getUser: vi.fn() } }, metadata: {}, ids: vi.fn(), importShow: vi.fn(), full: vi.fn(), demo: vi.fn(), revalidate: vi.fn(), limit: vi.fn(), admin: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/features/tracking/action-validation", () => ({ isShowTmdbId: (id: number) => Number.isSafeInteger(id) && id > 0 }));
vi.mock("@/lib/supabase/admin", () => ({ createOptionalSupabaseServiceRoleClient: mocks.admin }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => mocks.client }));
vi.mock("@/lib/tmdb/rate-limit", () => ({ consumeTmdbRateLimit: mocks.limit }));
vi.mock("@/lib/tmdb/server", () => ({ getFullTmdbShowDetails: mocks.full }));
vi.mock("@/features/guest/server", () => ({ addCachedDemoShow: mocks.demo }));
vi.mock("../features/search/data", () => ({ addTmdbShowToLibrary: mocks.importShow, getUserLibraryShowIds: mocks.ids }));
import { addShowToLibraryAction } from "../features/search/actions";
beforeEach(() => {
  vi.resetAllMocks(); mocks.client.auth.getUser.mockResolvedValue({ data: { user: { id: "user", is_anonymous: false } }, error: null });
  mocks.limit.mockReturnValue({ allowed: true }); mocks.ids.mockResolvedValue([]); mocks.admin.mockReturnValue(mocks.metadata);
  mocks.full.mockResolvedValue({ title: "full fixture" }); mocks.importShow.mockResolvedValue({ status: "added", title: "Dark" });
  mocks.demo.mockResolvedValue({ duplicate: false, title: "Fallout" });
  vi.spyOn(console, "error").mockImplementation(() => {});
});
describe("Discover reuses existing Add ownership", () => {
  it("keeps validation/auth/rate limiting and duplicate protection before any import", async () => {
    expect((await addShowToLibraryAction(-1)).status).toBe("error"); expect(mocks.full).not.toHaveBeenCalled();
    mocks.ids.mockResolvedValue([1]);
    expect((await addShowToLibraryAction(1)).status).toBe("duplicate"); expect(mocks.full).not.toHaveBeenCalled(); expect(mocks.importShow).not.toHaveBeenCalled();
    mocks.client.auth.getUser.mockResolvedValue({ data: { user: null }, error: null });
    expect((await addShowToLibraryAction(2)).status).toBe("error"); expect(mocks.full).not.toHaveBeenCalled();
  });
  it("imports only on explicit permanent-user Add and revalidates Discover and compatibility routes", async () => {
    expect((await addShowToLibraryAction(1)).status).toBe("success");
    expect(mocks.full).toHaveBeenCalledWith(1); expect(mocks.importShow).toHaveBeenCalledWith(expect.objectContaining({ userClient: mocks.client, metadataClient: mocks.metadata, userId: "user" }));
    expect(mocks.revalidate.mock.calls).toEqual([["/search"], ["/discover"], ["/library"]]); expect(mocks.demo).not.toHaveBeenCalled();
  });
  it("adds guests through cached membership only without imports or TMDB", async () => {
    mocks.client.auth.getUser.mockResolvedValue({ data: { user: { id: "guest", is_anonymous: true } }, error: null });
    expect((await addShowToLibraryAction(1)).status).toBe("success"); expect(mocks.demo).toHaveBeenCalled();
    expect(mocks.full).not.toHaveBeenCalled(); expect(mocks.admin).not.toHaveBeenCalled(); expect(mocks.importShow).not.toHaveBeenCalled();
    expect(mocks.revalidate).toHaveBeenCalledWith("/discover");
  });
  it("keeps failed Add safe and never claims success", async () => {
    mocks.full.mockRejectedValue(new Error("secret-token"));
    expect(await addShowToLibraryAction(1)).toMatchObject({ status: "error", message: "Unable to add this show right now." });
    expect(mocks.revalidate).not.toHaveBeenCalled(); expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("secret-token");
  });
});

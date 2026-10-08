import { beforeEach, describe, expect, it, vi } from "vitest";
import { startGuestDemoAction, resetGuestDemoAction, exitGuestDemoAction } from "../features/guest/actions";
import { INITIAL_AUTH_FORM_STATE } from "../features/auth/state";

const mocks = vi.hoisted(() => ({ client: vi.fn(), initialize: vi.fn(), enabled: vi.fn(), redirect: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseCookieWriteRequiredServerClient: mocks.client }));
vi.mock("@/features/auth/captcha", () => ({ readCaptchaToken: (form: FormData) => form.get("captchaToken") || undefined }));
vi.mock("../features/guest/server", () => ({ initializeGuest: mocks.initialize, isDemoEnabled: mocks.enabled }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

const guest = { id: "guest-a", is_anonymous: true };
let auth: { getUser: ReturnType<typeof vi.fn>; signInAnonymously: ReturnType<typeof vi.fn>; signOut: ReturnType<typeof vi.fn> };
function form() { const value = new FormData(); value.set("captchaToken", "captcha-test-token"); value.set("timeZone", "America/Sao_Paulo"); return value; }

describe("guest actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enabled.mockReturnValue(true);
    mocks.redirect.mockImplementation((path: string) => { throw new Error(`redirect:${path}`); });
    mocks.initialize.mockResolvedValue(undefined);
    auth = { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      signInAnonymously: vi.fn().mockResolvedValue({ data: { user: guest }, error: null }),
      signOut: vi.fn().mockResolvedValue({ error: null }) };
    mocks.client.mockResolvedValue({ auth });
  });
  it("creates through the cookie-writing client with CAPTCHA and redirects only after seeding", async () => {
    await expect(startGuestDemoAction(INITIAL_AUTH_FORM_STATE, form())).rejects.toThrow("redirect:/library");
    expect(auth.signInAnonymously).toHaveBeenCalledWith({ options: { captchaToken: "captcha-test-token" } });
    expect(mocks.initialize).toHaveBeenCalledWith(guest, "America/Sao_Paulo");
    expect(mocks.initialize.mock.invocationCallOrder[0]).toBeLessThan(mocks.redirect.mock.invocationCallOrder[0]);
  });
  it("resumes the same guest without a new Auth account or CAPTCHA", async () => {
    auth.getUser.mockResolvedValue({ data: { user: guest }, error: null });
    await expect(startGuestDemoAction(INITIAL_AUTH_FORM_STATE, new FormData())).rejects.toThrow("redirect:/library");
    expect(auth.signInAnonymously).not.toHaveBeenCalled();
    expect(mocks.initialize).toHaveBeenCalledWith(guest, null);
  });
  it("does not replace a permanent session", async () => {
    auth.getUser.mockResolvedValue({ data: { user: { id: "real", is_anonymous: false } }, error: null });
    expect((await startGuestDemoAction(INITIAL_AUTH_FORM_STATE, form())).status).toBe("error");
    expect(auth.signInAnonymously).not.toHaveBeenCalled(); expect(mocks.initialize).not.toHaveBeenCalled();
  });
  it("fails closed when disabled or CAPTCHA is missing", async () => {
    mocks.enabled.mockReturnValue(false);
    expect((await startGuestDemoAction(INITIAL_AUTH_FORM_STATE, form())).status).toBe("error");
    expect(mocks.client).not.toHaveBeenCalled();
    mocks.enabled.mockReturnValue(true);
    expect((await startGuestDemoAction(INITIAL_AUTH_FORM_STATE, new FormData())).status).toBe("error");
    expect(auth.signInAnonymously).not.toHaveBeenCalled();
  });
  it.each(["auth", "seed", "cookies"])("returns safe feedback for %s failure without success redirect", async (failure) => {
    if (failure === "auth") auth.signInAnonymously.mockResolvedValue({ data: { user: null }, error: { message: "private token" } });
    if (failure === "seed") mocks.initialize.mockRejectedValue(new Error("private token"));
    if (failure === "cookies") mocks.client.mockRejectedValue(new Error("private token"));
    const result = await startGuestDemoAction(INITIAL_AUTH_FORM_STATE, form());
    expect(result.status).toBe("error"); expect(JSON.stringify(result)).not.toContain("private token"); expect(mocks.redirect).not.toHaveBeenCalled();
  });
  it("handles AuthSessionMissingError but does not replace an unverifiable session", async () => {
    auth.getUser.mockResolvedValue({ data: { user: null }, error: { name: "AuthApiError" } });
    expect((await startGuestDemoAction(INITIAL_AUTH_FORM_STATE, form())).status).toBe("error");
    expect(auth.signInAnonymously).not.toHaveBeenCalled();
    auth.getUser.mockResolvedValue({ data: { user: null }, error: { name: "AuthSessionMissingError" } });
    await expect(startGuestDemoAction(INITIAL_AUTH_FORM_STATE, form())).rejects.toThrow("redirect:/library");
  });
  it("reset requires typed confirmation and anonymous authentication", async () => {
    expect((await resetGuestDemoAction(INITIAL_AUTH_FORM_STATE, form())).status).toBe("error");
    const value = form(); value.set("confirmation", "RESET DEMO");
    expect((await resetGuestDemoAction(INITIAL_AUTH_FORM_STATE, value)).status).toBe("error");
    auth.getUser.mockResolvedValue({ data: { user: guest }, error: null });
    expect((await resetGuestDemoAction(INITIAL_AUTH_FORM_STATE, value)).status).toBe("success");
    expect(mocks.initialize).toHaveBeenCalledWith(guest, null, true); expect(mocks.revalidate).toHaveBeenCalledWith("/", "layout");
  });
  it("exit signs out locally and refuses a permanent session", async () => {
    auth.getUser.mockResolvedValue({ data: { user: guest }, error: null });
    await expect(exitGuestDemoAction(INITIAL_AUTH_FORM_STATE, form())).rejects.toThrow("redirect:/sign-in");
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    auth.signOut.mockClear(); auth.getUser.mockResolvedValue({ data: { user: { is_anonymous: false } }, error: null });
    expect((await exitGuestDemoAction(INITIAL_AUTH_FORM_STATE, form())).status).toBe("error"); expect(auth.signOut).not.toHaveBeenCalled();
  });
});

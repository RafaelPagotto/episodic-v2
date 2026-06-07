import { beforeEach, describe, expect, it, vi } from "vitest";

import { signInAction, signOutAction } from "../features/auth/actions";
import { INITIAL_AUTH_FORM_STATE } from "../features/auth/state";

const redirectMock = vi.hoisted(() =>
  vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
);
const createWriteRequiredClientMock = vi.hoisted(() => vi.fn());
const createOptionalWriteRequiredClientMock = vi.hoisted(() => vi.fn());
const isCookieWriteErrorMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("@/lib/supabase/server", () => ({
  createOptionalSupabaseCookieWriteRequiredServerClient: createOptionalWriteRequiredClientMock,
  createSupabaseCookieWriteRequiredServerClient: createWriteRequiredClientMock,
  isSupabaseAuthCookieWriteError: isCookieWriteErrorMock,
}));

function signInFormData() {
  const formData = new FormData();
  formData.set("email", "viewer@example.com");
  formData.set("password", "correct-password");

  return formData;
}

describe("auth actions", () => {
  beforeEach(() => {
    redirectMock.mockClear();
    createWriteRequiredClientMock.mockReset();
    createOptionalWriteRequiredClientMock.mockReset();
    isCookieWriteErrorMock.mockReset();
    isCookieWriteErrorMock.mockReturnValue(false);
  });

  it("uses the write-required Supabase client and redirects after successful sign-in", async () => {
    const signInWithPassword = vi.fn().mockResolvedValue({ error: null });
    createWriteRequiredClientMock.mockResolvedValue({
      auth: {
        signInWithPassword,
      },
    });

    await expect(signInAction(INITIAL_AUTH_FORM_STATE, signInFormData())).rejects.toThrow(
      "redirect:/library",
    );

    expect(createWriteRequiredClientMock).toHaveBeenCalledTimes(1);
    expect(signInWithPassword).toHaveBeenCalledWith({
      email: "viewer@example.com",
      password: "correct-password",
    });
  });

  it("returns a controlled error when sign-in cannot persist auth cookies", async () => {
    const cookieWriteError = new Error("cookie write failed");
    const signInWithPassword = vi.fn().mockRejectedValue(cookieWriteError);
    createWriteRequiredClientMock.mockResolvedValue({
      auth: {
        signInWithPassword,
      },
    });
    isCookieWriteErrorMock.mockImplementation((error) => error === cookieWriteError);

    const result = await signInAction(INITIAL_AUTH_FORM_STATE, signInFormData());

    expect(result).toEqual({
      message: "Unable to persist your sign-in session. Please try again.",
      status: "error",
    });
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("uses the optional write-required Supabase client for sign-out", async () => {
    const signOut = vi.fn().mockResolvedValue({ error: null });
    createOptionalWriteRequiredClientMock.mockResolvedValue({
      auth: {
        signOut,
      },
    });

    await expect(signOutAction()).rejects.toThrow("redirect:/sign-in");

    expect(createOptionalWriteRequiredClientMock).toHaveBeenCalledTimes(1);
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});

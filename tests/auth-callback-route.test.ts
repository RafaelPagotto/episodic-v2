import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "../app/auth/callback/route";

const createOptionalWriteRequiredClientMock = vi.hoisted(() => vi.fn());
const isCookieWriteErrorMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/server", () => ({
  createOptionalSupabaseCookieWriteRequiredServerClient: createOptionalWriteRequiredClientMock,
  isSupabaseAuthCookieWriteError: isCookieWriteErrorMock,
}));

function callbackRequest(url: string) {
  return new NextRequest(url);
}

function redirectLocation(response: Response) {
  return response.headers.get("location");
}

describe("auth callback route", () => {
  beforeEach(() => {
    createOptionalWriteRequiredClientMock.mockReset();
    isCookieWriteErrorMock.mockReset();
    isCookieWriteErrorMock.mockReturnValue(false);
  });

  it("uses the write-required Supabase client and redirects to the safe next path", async () => {
    const exchangeCodeForSession = vi.fn().mockResolvedValue({ error: null });
    createOptionalWriteRequiredClientMock.mockResolvedValue({
      auth: {
        exchangeCodeForSession,
      },
    });

    const response = await GET(
      callbackRequest("https://episodic.example/auth/callback?code=abc123&next=/library"),
    );

    expect(createOptionalWriteRequiredClientMock).toHaveBeenCalledTimes(1);
    expect(exchangeCodeForSession).toHaveBeenCalledWith("abc123");
    expect(redirectLocation(response)).toBe("https://episodic.example/library");
  });

  it("redirects safely when the callback code is missing", async () => {
    const response = await GET(callbackRequest("https://episodic.example/auth/callback"));

    expect(redirectLocation(response)).toBe("https://episodic.example/sign-in?error=missing_auth_code");
    expect(createOptionalWriteRequiredClientMock).not.toHaveBeenCalled();
  });

  it("redirects safely when Supabase rejects the callback exchange", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    createOptionalWriteRequiredClientMock.mockResolvedValue({
      auth: {
        exchangeCodeForSession: vi.fn().mockResolvedValue({ error: new Error("invalid code") }),
      },
    });

    const response = await GET(callbackRequest("https://episodic.example/auth/callback?code=abc123"));

    expect(redirectLocation(response)).toBe("https://episodic.example/sign-in?error=auth_callback_failed");
    expect(consoleErrorSpy).toHaveBeenCalledWith("[auth] Supabase auth callback exchange failed.");
  });

  it("redirects safely when callback session cookies cannot be persisted", async () => {
    const cookieWriteError = new Error("cookie write failed");
    createOptionalWriteRequiredClientMock.mockResolvedValue({
      auth: {
        exchangeCodeForSession: vi.fn().mockRejectedValue(cookieWriteError),
      },
    });
    isCookieWriteErrorMock.mockImplementation((error) => error === cookieWriteError);

    const response = await GET(callbackRequest("https://episodic.example/auth/callback?code=abc123"));

    expect(redirectLocation(response)).toBe(
      "https://episodic.example/sign-in?error=session_persistence_failed",
    );
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type CookieToSet = {
  name: string;
  value: string;
  options?: Record<string, unknown>;
};

type CookieHandlers = {
  getAll: () => CookieToSet[];
  setAll: (cookiesToSet: CookieToSet[]) => void;
};

const createServerClientMock = vi.hoisted(() =>
  vi.fn((_url: string, _key: string, options: { cookies: CookieHandlers }) => ({
    cookieHandlers: options.cookies,
  })),
);
const cookiesMock = vi.hoisted(() => vi.fn());

vi.mock("@supabase/ssr", () => ({
  createServerClient: createServerClientMock,
}));

vi.mock("next/headers", () => ({
  cookies: cookiesMock,
}));

vi.mock("@/lib/supabase/env", () => {
  function readSupabasePublicEnv() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      return null;
    }

    return {
      supabaseAnonKey,
      supabaseUrl,
    };
  }

  return {
    getOptionalSupabasePublicEnv: () => readSupabasePublicEnv(),
    getSupabasePublicEnv: () => {
      const env = readSupabasePublicEnv();

      if (!env) {
        throw new Error("Missing Supabase environment variables.");
      }

      return env;
    },
  };
});

const ORIGINAL_ENV = process.env;

async function loadServerModule() {
  vi.resetModules();

  return import("../lib/supabase/server");
}

function setSupabaseEnv() {
  process.env = {
    ...ORIGINAL_ENV,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
    NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
  };
}

describe("Supabase server client cookie modes", () => {
  beforeEach(() => {
    setSupabaseEnv();
    createServerClientMock.mockClear();
    cookiesMock.mockReset();
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
    vi.restoreAllMocks();
  });

  it("keeps the default server client read-tolerant when cookie writes fail", async () => {
    const cookieStore = {
      getAll: vi.fn(() => []),
      set: vi.fn(() => {
        throw new Error("cannot write in this context");
      }),
    };
    cookiesMock.mockResolvedValue(cookieStore);
    const { createSupabaseServerClient } = await loadServerModule();

    const client = await createSupabaseServerClient() as unknown as { cookieHandlers: CookieHandlers };

    expect(() =>
      client.cookieHandlers.setAll([
        {
          name: "sb-test-auth-token",
          value: "redacted",
        },
      ]),
    ).not.toThrow();
    expect(cookieStore.set).toHaveBeenCalledTimes(1);
  });

  it("throws a sanitized error when write-required cookie writes fail", async () => {
    const cookieStore = {
      getAll: vi.fn(() => []),
      set: vi.fn(() => {
        throw new Error("cannot write in this context");
      }),
    };
    cookiesMock.mockResolvedValue(cookieStore);
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const {
      SUPABASE_AUTH_COOKIE_WRITE_ERROR_MESSAGE,
      createSupabaseCookieWriteRequiredServerClient,
    } = await loadServerModule();

    const client = await createSupabaseCookieWriteRequiredServerClient() as unknown as {
      cookieHandlers: CookieHandlers;
    };

    expect(() =>
      client.cookieHandlers.setAll([
        {
          name: "sb-test-auth-token",
          value: "redacted",
        },
      ]),
    ).toThrow(SUPABASE_AUTH_COOKIE_WRITE_ERROR_MESSAGE);
    expect(consoleErrorSpy).toHaveBeenCalledWith("[auth] Failed to write Supabase auth cookies.");
  });
});

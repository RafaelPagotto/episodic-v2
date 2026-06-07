import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { getOptionalSupabasePublicEnv, getSupabasePublicEnv } from "@/lib/supabase/env";
import type { Database } from "@/lib/supabase/types";

type SupabasePublicEnv = {
  supabaseUrl: string;
  supabaseAnonKey: string;
};

type CookieWriteMode = "read-tolerant" | "write-required";

export const SUPABASE_AUTH_COOKIE_WRITE_ERROR_MESSAGE = "Supabase auth cookie write failed.";

export function isSupabaseAuthCookieWriteError(error: unknown) {
  return error instanceof Error && error.message === SUPABASE_AUTH_COOKIE_WRITE_ERROR_MESSAGE;
}

function createCookieWriteError() {
  return new Error(SUPABASE_AUTH_COOKIE_WRITE_ERROR_MESSAGE);
}

function logCookieWriteFailure(mode: CookieWriteMode) {
  if (mode === "write-required") {
    console.error("[auth] Failed to write Supabase auth cookies.");
  }
}

async function createServerClientWithEnv(
  { supabaseAnonKey, supabaseUrl }: SupabasePublicEnv,
  cookieWriteMode: CookieWriteMode,
) {
  const cookieStore = await cookies();

  return createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          if (cookieWriteMode === "write-required") {
            try {
              cookieStore.set(name, value, options);
            } catch {
              logCookieWriteFailure(cookieWriteMode);
              throw createCookieWriteError();
            }
            return;
          }

          try {
            cookieStore.set(name, value, options);
          } catch {
            // Server Components can read cookies but cannot always write them.
            // Middleware refreshes auth cookies before rendering.
          }
        });
      },
    },
  });
}

async function createWriteRequiredServerClientWithEnv(env: SupabasePublicEnv) {
  const client = await createServerClientWithEnv(env, "write-required");

  return client;
}

// Read-tolerant server-side Supabase client for Server Components and route
// guards. It can ignore cookie write failures because middleware refreshes
// auth cookies before rendering.
export async function createSupabaseServerClient() {
  return createServerClientWithEnv(getSupabasePublicEnv(), "read-tolerant");
}

// Optional server client for layouts that must still render while local
// Supabase env values are not configured yet.
export async function createOptionalSupabaseServerClient() {
  const env = getOptionalSupabasePublicEnv();

  if (!env) {
    return null;
  }

  return createServerClientWithEnv(env, "read-tolerant");
}

// Write-required server-side Supabase client for Server Actions and Route
// Handlers that must persist auth cookies before redirecting.
export async function createSupabaseCookieWriteRequiredServerClient() {
  return createWriteRequiredServerClientWithEnv(getSupabasePublicEnv());
}

export async function createOptionalSupabaseCookieWriteRequiredServerClient() {
  const env = getOptionalSupabasePublicEnv();

  if (!env) {
    return null;
  }

  return createWriteRequiredServerClientWithEnv(env);
}

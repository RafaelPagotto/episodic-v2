import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { getOptionalSupabasePublicEnv, getSupabasePublicEnv } from "@/lib/supabase/env";
import type { Database } from "@/lib/supabase/types";

type SupabasePublicEnv = {
  supabaseUrl: string;
  supabaseAnonKey: string;
};

async function createServerClientWithEnv({ supabaseAnonKey, supabaseUrl }: SupabasePublicEnv) {
  const cookieStore = await cookies();

  return createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
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

// Server-side Supabase client for Server Components, Route Handlers, and
// Server Actions. It still uses the public anon key so RLS remains enforced.
// Never import or use SUPABASE_SERVICE_ROLE_KEY here.
export async function createSupabaseServerClient() {
  return createServerClientWithEnv(getSupabasePublicEnv());
}

// Optional server client for layouts that must still render while local
// Supabase env values are not configured yet.
export async function createOptionalSupabaseServerClient() {
  const env = getOptionalSupabasePublicEnv();

  if (!env) {
    return null;
  }

  return createServerClientWithEnv(env);
}

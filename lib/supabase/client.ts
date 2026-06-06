"use client";

import { createBrowserClient } from "@supabase/ssr";

import { getSupabasePublicEnv } from "@/lib/supabase/env";
import type { Database } from "@/lib/supabase/types";

// Browser-safe Supabase client.
// This uses only NEXT_PUBLIC_* values and the public anon key. User data must
// remain protected by Supabase Row Level Security policies.
export function createSupabaseBrowserClient() {
  const { supabaseUrl, supabaseAnonKey } = getSupabasePublicEnv();

  return createBrowserClient<Database>(supabaseUrl, supabaseAnonKey);
}

import "server-only";

import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";

function readSupabaseServiceRoleEnv() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (
    !supabaseUrl
    || !serviceRoleKey
    || supabaseUrl.includes("your-project-id")
    || serviceRoleKey.includes("your-service-role-key")
  ) {
    return null;
  }

  return {
    serviceRoleKey,
    supabaseUrl,
  };
}

// Server-only service-role client for trusted writes to shared metadata tables.
// Never import this from Client Components or use it for user-owned mutations.
export function createOptionalSupabaseServiceRoleClient() {
  const env = readSupabaseServiceRoleEnv();

  if (!env) {
    return null;
  }

  return createClient<Database>(env.supabaseUrl, env.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

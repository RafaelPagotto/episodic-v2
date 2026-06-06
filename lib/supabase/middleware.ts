import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getOptionalSupabasePublicEnv } from "@/lib/supabase/env";
import type { Database } from "@/lib/supabase/types";

// Middleware Supabase client.
// This runs on the server edge/runtime with the public anon key only. Its job
// is to refresh auth cookies before App Router pages render; it does not use
// service-role credentials and does not make authorization decisions yet.
export async function updateSupabaseSession(request: NextRequest) {
  const env = getOptionalSupabasePublicEnv();

  if (!env) {
    return NextResponse.next({
      request,
    });
  }

  const { supabaseUrl, supabaseAnonKey } = env;
  let response = NextResponse.next({
    request,
  });

  const supabase = createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });

        response = NextResponse.next({
          request,
        });

        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  await supabase.auth.getUser();

  return response;
}

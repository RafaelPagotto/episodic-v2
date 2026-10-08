import { redirect } from "next/navigation";

import { createOptionalSupabaseServerClient } from "@/lib/supabase/server";
import { isGuestReady } from "@/features/guest/server";

export async function getCurrentUser() {
  const supabase = await createOptionalSupabaseServerClient();

  if (!supabase) {
    return null;
  }

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    return null;
  }

  if (user?.is_anonymous) {
    try { if (!await isGuestReady(supabase, user)) return null; } catch { return null; }
  }

  return user;
}

export async function requireCurrentUser() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/sign-in");
  }

  return user;
}

export async function redirectAuthenticatedUser() {
  const user = await getCurrentUser();

  if (user) {
    redirect("/library");
  }
}

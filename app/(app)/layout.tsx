import type { ReactNode } from "react";

import { AppShell } from "@/components/app-shell";
import { requireCurrentUser } from "@/features/auth/session";
import { TimeZoneInitializer } from "@/features/profile/components/timezone-initializer";
import { getPersistedUserTimeZone } from "@/features/profile/timezone";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getGuestSession } from "@/features/guest/server";
import { GuestControls } from "@/features/guest/components/guest-controls";
import { resolveTimeZone } from "@/lib/date-only";

type ProtectedAppLayoutProps = {
  children: ReactNode;
};

export const dynamic = "force-dynamic";

export default async function ProtectedAppLayout({ children }: ProtectedAppLayoutProps) {
  const user = await requireCurrentUser();
  const supabase = await createSupabaseServerClient();
  const persistedTimeZone = await getPersistedUserTimeZone(supabase, user.id);
  const guest = user.is_anonymous ? await getGuestSession(supabase, user) : null;

  return (
    <>
      <TimeZoneInitializer persistedTimeZone={persistedTimeZone} />
      <AppShell userEmail={user.is_anonymous ? "Guest demo" : user.email}>
        {guest ? <GuestControls expiresAt={guest.expires_at} timeZone={resolveTimeZone(persistedTimeZone)} /> : null}
        {children}
      </AppShell>
    </>
  );
}

import type { ReactNode } from "react";

import { AppShell } from "@/components/app-shell";
import { requireCurrentUser } from "@/features/auth/session";
import { TimeZoneInitializer } from "@/features/profile/components/timezone-initializer";
import { getPersistedUserTimeZone } from "@/features/profile/timezone";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type ProtectedAppLayoutProps = {
  children: ReactNode;
};

export const dynamic = "force-dynamic";

export default async function ProtectedAppLayout({ children }: ProtectedAppLayoutProps) {
  const user = await requireCurrentUser();
  const supabase = await createSupabaseServerClient();
  const persistedTimeZone = await getPersistedUserTimeZone(supabase, user.id);

  return (
    <>
      <TimeZoneInitializer persistedTimeZone={persistedTimeZone} />
      <AppShell userEmail={user.email}>
        {children}
      </AppShell>
    </>
  );
}

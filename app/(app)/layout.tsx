import type { ReactNode } from "react";

import { AppNavigation } from "@/components/app-navigation";
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
    <div className="min-h-screen bg-background">
      <TimeZoneInitializer persistedTimeZone={persistedTimeZone} />
      <AppNavigation userEmail={user.email} />
      <main className="min-h-screen px-4 py-6 sm:px-6 md:ml-64 md:px-8 md:py-8 lg:px-10">
        {children}
      </main>
    </div>
  );
}

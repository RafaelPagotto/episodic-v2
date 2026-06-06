import type { ReactNode } from "react";

import { AppNavigation } from "@/components/app-navigation";
import { requireCurrentUser } from "@/features/auth/session";

type ProtectedAppLayoutProps = {
  children: ReactNode;
};

export const dynamic = "force-dynamic";

export default async function ProtectedAppLayout({ children }: ProtectedAppLayoutProps) {
  const user = await requireCurrentUser();

  return (
    <div className="min-h-screen bg-background">
      <AppNavigation userEmail={user.email} />
      <main className="min-h-screen px-4 py-6 sm:px-6 md:ml-64 md:px-8 md:py-8 lg:px-10">
        {children}
      </main>
    </div>
  );
}

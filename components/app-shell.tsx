"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";

import { AppNavigation } from "@/components/app-navigation";
import { SIDEBAR_STATE_STORAGE_KEY } from "@/lib/constants";

type AppShellProps = {
  children: ReactNode;
  userEmail: string | null | undefined;
};

export function AppShell({ children, userEmail }: AppShellProps) {
  const [collapsed, setCollapsed] = useState(true);

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(SIDEBAR_STATE_STORAGE_KEY) !== "expanded");
    } catch {
      // Keep the default when browser storage is unavailable.
    }
  }, []);

  function toggleSidebar() {
    const nextCollapsed = !collapsed;
    setCollapsed(nextCollapsed);
    try {
      window.localStorage.setItem(SIDEBAR_STATE_STORAGE_KEY, nextCollapsed ? "collapsed" : "expanded");
    } catch {
      // Keep the in-session choice when browser storage is unavailable.
    }
  }

  return (
    <div
      className="min-h-screen bg-background"
      style={{ "--sidebar-width": collapsed ? "4.5rem" : "16rem" } as CSSProperties}
    >
      <AppNavigation collapsed={collapsed} onToggleSidebar={toggleSidebar} userEmail={userEmail} />
      <main className="min-h-screen px-4 py-6 transition-[margin-left] duration-200 motion-reduce:transition-none sm:px-6 md:ml-[var(--sidebar-width)] md:px-4 md:py-8 lg:px-10">
        {children}
      </main>
    </div>
  );
}

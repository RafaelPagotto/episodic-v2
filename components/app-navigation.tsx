"use client";

import { BarChart3, Clapperboard, LayoutDashboard, LogOut, Search, UserCircle } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";

import { BrandLogo } from "@/components/brand-logo";
import { signOutAction } from "@/features/auth/actions";
import { APP_NAME, APP_NAV_ITEMS } from "@/lib/constants";
import { cn } from "@/lib/utils";

const NAV_ICONS: Record<(typeof APP_NAV_ITEMS)[number]["label"], ComponentType<{ className?: string }>> = {
  Dashboard: LayoutDashboard,
  Library: Clapperboard,
  Profile: UserCircle,
  Progress: BarChart3,
  Search,
};

type AppNavigationProps = {
  userEmail: string | null | undefined;
};

function NavLink({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: ComponentType<{ className?: string }>;
  label: string;
}) {
  const pathname = usePathname();
  const isActive = pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "inline-flex min-h-10 items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        isActive
          ? "bg-primary text-primary-foreground shadow-sm"
          : "text-muted-foreground hover:bg-secondary hover:text-foreground",
      )}
      href={href}
    >
      <Icon className="size-4 shrink-0" />
      <span>{label}</span>
    </Link>
  );
}

function SignOutButton({ compact = false }: { compact?: boolean }) {
  return (
    <form action={signOutAction}>
      <button
        className={cn(
          "inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-muted-foreground transition hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          compact ? "w-auto" : "w-full",
        )}
        type="submit"
      >
        <LogOut className="size-4" />
        Sign out
      </button>
    </form>
  );
}

export function AppNavigation({ userEmail }: AppNavigationProps) {
  const accountLabel = userEmail ?? "Unknown email";

  return (
    <>
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur md:hidden">
        <div className="flex min-h-16 items-center justify-between gap-3 px-4">
          <Link className="text-lg font-semibold tracking-tight" href="/dashboard">
            {APP_NAME}
          </Link>
          <SignOutButton compact />
        </div>
        <nav
          aria-label="Primary navigation"
          className="flex gap-2 overflow-x-auto border-t px-4 py-2"
        >
          {APP_NAV_ITEMS.map((item) => {
            const Icon = NAV_ICONS[item.label];

            return <NavLink key={item.href} href={item.href} icon={Icon} label={item.label} />;
          })}
        </nav>
      </header>

      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r bg-card px-5 py-6 md:block">
        <Link className="inline-flex items-center gap-3 text-xl font-semibold tracking-tight" href="/dashboard">
          <BrandLogo className="size-8" />
          <span>{APP_NAME}</span>
        </Link>
        <nav aria-label="Primary navigation" className="mt-8 flex flex-col gap-1">
          {APP_NAV_ITEMS.map((item) => {
            const Icon = NAV_ICONS[item.label];

            return <NavLink key={item.href} href={item.href} icon={Icon} label={item.label} />;
          })}
        </nav>
        <div className="absolute inset-x-5 bottom-6 space-y-4">
          <div className="rounded-md border bg-background p-3">
            <p className="text-xs font-medium uppercase text-muted-foreground">Signed in as</p>
            <p className="mt-1 truncate text-sm font-medium">{accountLabel}</p>
          </div>
          <SignOutButton />
        </div>
      </aside>
    </>
  );
}

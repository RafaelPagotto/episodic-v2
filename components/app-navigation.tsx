"use client";

import { Clapperboard, LayoutDashboard, LogOut, PanelLeftClose, PanelLeftOpen, Search, UserCircle } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";

import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { signOutAction } from "@/features/auth/actions";
import { APP_NAME, APP_NAV_ITEMS } from "@/lib/constants";
import { cn } from "@/lib/utils";

const NAV_ICONS: Record<(typeof APP_NAV_ITEMS)[number]["label"], ComponentType<{ className?: string }>> = {
  Dashboard: LayoutDashboard,
  Library: Clapperboard,
  Profile: UserCircle,
  Search,
};

type AppNavigationProps = {
  collapsed: boolean;
  onToggleSidebar: () => void;
  userEmail: string | null | undefined;
};

function NavLink({
  className,
  compact = false,
  href,
  icon: Icon,
  label,
}: {
  className?: string;
  compact?: boolean;
  href: string;
  icon: ComponentType<{ className?: string }>;
  label: string;
}) {
  const pathname = usePathname();
  const isActive = pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      aria-current={isActive ? "page" : undefined}
      aria-label={label}
      className={cn(
        "inline-flex min-h-10 items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        isActive
          ? "bg-primary text-primary-foreground shadow-sm"
          : "text-muted-foreground hover:bg-secondary hover:text-foreground",
        compact && "h-11 justify-center px-0",
        className,
      )}
      href={href}
      title={compact ? label : undefined}
    >
      <Icon aria-hidden="true" className={cn("shrink-0", compact ? "size-5" : "size-4")} />
      <span className={compact ? "sr-only" : undefined}>{label}</span>
    </Link>
  );
}

function SignOutButton({ compact = false, iconOnly = false }: { compact?: boolean; iconOnly?: boolean }) {
  return (
    <form action={signOutAction}>
      <button
        aria-label="Sign out"
        className={cn(
          "inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-muted-foreground transition hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          compact ? "w-auto" : "w-full",
          iconOnly && "size-11 p-0",
        )}
        title={iconOnly ? "Sign out" : undefined}
        type="submit"
      >
        <LogOut aria-hidden="true" className={iconOnly ? "size-5" : "size-4"} />
        <span className={iconOnly ? "sr-only" : undefined}>Sign out</span>
      </button>
    </form>
  );
}

export function AppNavigation({ collapsed, onToggleSidebar, userEmail }: AppNavigationProps) {
  const accountLabel = userEmail ?? "Unknown email";
  const accountInitial = userEmail?.trim().charAt(0).toUpperCase() || "?";
  const toggleLabel = collapsed ? "Expand sidebar" : "Collapse sidebar";
  const ToggleIcon = collapsed ? PanelLeftOpen : PanelLeftClose;

  return (
    <>
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur md:hidden">
        <div className="grid min-h-16 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 px-3 sm:px-4">
          <Link aria-label={APP_NAME} className="inline-flex shrink-0 items-center gap-3 text-lg font-semibold tracking-tight" href="/dashboard">
            <BrandLogo className="size-8 shrink-0" />
            <span className="hidden min-[480px]:inline">{APP_NAME}</span>
          </Link>
          <nav
            aria-label="Primary navigation"
            className="flex min-w-0 items-center justify-center gap-1 sm:gap-2"
          >
            {APP_NAV_ITEMS.map((item) => {
              const Icon = NAV_ICONS[item.label];

              return <NavLink className="w-11 shrink-0" compact key={item.href} href={item.href} icon={Icon} label={item.label} />;
            })}
          </nav>
          <SignOutButton compact iconOnly />
        </div>
      </header>

      <aside
        className={cn(
          "fixed inset-y-0 left-0 hidden w-[var(--sidebar-width)] flex-col overflow-y-auto border-r bg-card py-6 transition-[width] duration-200 motion-reduce:transition-none md:flex",
          collapsed ? "px-2" : "px-5",
        )}
        id="desktop-sidebar"
      >
        <div className={cn("flex shrink-0 gap-3", collapsed ? "flex-col items-center" : "items-center justify-between")}>
          <Link
            aria-label={APP_NAME}
            className="inline-flex min-w-0 items-center gap-3 text-xl font-semibold tracking-tight"
            href="/dashboard"
            title={collapsed ? APP_NAME : undefined}
          >
            <BrandLogo className="size-8" />
            <span className={collapsed ? "sr-only" : undefined}>{APP_NAME}</span>
          </Link>
          <Button
            aria-controls="desktop-sidebar"
            aria-expanded={!collapsed}
            aria-label={toggleLabel}
            className="shrink-0"
            onClick={onToggleSidebar}
            size="icon"
            title={toggleLabel}
            type="button"
            variant="ghost"
          >
            <ToggleIcon aria-hidden="true" className="size-5" />
          </Button>
        </div>
        <nav aria-label="Primary navigation" className="mt-8 flex shrink-0 flex-col gap-1">
          {APP_NAV_ITEMS.map((item) => {
            const Icon = NAV_ICONS[item.label];

            return <NavLink compact={collapsed} key={item.href} href={item.href} icon={Icon} label={item.label} />;
          })}
        </nav>
        <div className={cn("mt-auto shrink-0 space-y-4 pt-6", collapsed && "flex flex-col items-center")}>
          {collapsed ? (
            <div className="flex size-10 items-center justify-center rounded-full border bg-background font-semibold text-muted-foreground" title={`Signed in as ${accountLabel}`}>
              <span aria-hidden="true">{accountInitial}</span>
              <span className="sr-only">Signed in as {accountLabel}</span>
            </div>
          ) : (
            <div className="rounded-md border bg-background p-3">
              <p className="text-xs font-medium uppercase text-muted-foreground">Signed in as</p>
              <p className="mt-1 truncate text-sm font-medium">{accountLabel}</p>
            </div>
          )}
          <SignOutButton iconOnly={collapsed} />
        </div>
      </aside>
    </>
  );
}

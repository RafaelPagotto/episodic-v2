import type { ReactNode } from "react";

type AuthLayoutProps = {
  children: ReactNode;
};

export const dynamic = "force-dynamic";

export default function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10 sm:px-6">
      <div className="w-full max-w-md space-y-7">
        <div className="text-center">
          <p className="text-3xl font-semibold tracking-tight">Episodic</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Track your shows without the clutter.
          </p>
        </div>
        {children}
      </div>
    </main>
  );
}

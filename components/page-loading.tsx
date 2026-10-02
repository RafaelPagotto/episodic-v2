import { BrandLogo } from "@/components/brand-logo";

export function PageLoading() {
  return (
    <section
      aria-live="polite"
      className="mx-auto flex min-h-[calc(100svh-11rem)] w-full max-w-6xl flex-col items-center justify-center gap-4 md:min-h-[calc(100svh-4rem)]"
      role="status"
    >
      <BrandLogo className="size-16" />
      <p className="text-sm text-muted-foreground">Loading…</p>
    </section>
  );
}

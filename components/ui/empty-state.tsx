import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type EmptyStateProps = {
  action?: ReactNode;
  className?: string;
  description: string;
  title: string;
};

export function EmptyState({ action, className, description, title }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-md border border-dashed bg-card px-4 py-10 text-center",
        className,
      )}
    >
      <h2 className="text-base font-semibold tracking-tight">{title}</h2>
      <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

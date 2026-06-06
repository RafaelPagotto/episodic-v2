import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type NoticeProps = {
  children: ReactNode;
  className?: string;
  tone?: "error" | "success" | "neutral";
};

export function Notice({ children, className, tone = "neutral" }: NoticeProps) {
  return (
    <div
      className={cn(
        "rounded-md border px-4 py-3 text-sm leading-6",
        tone === "error" && "border-destructive/40 bg-destructive/10 text-destructive",
        tone === "success" && "border-primary/30 bg-primary/10 text-primary",
        tone === "neutral" && "bg-card text-muted-foreground",
        className,
      )}
      role={tone === "error" ? "alert" : "status"}
    >
      {children}
    </div>
  );
}

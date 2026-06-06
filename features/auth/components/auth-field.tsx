import type { InputHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

type AuthFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  name: string;
  error?: string;
};

export function AuthField({ className, error, id, label, name, ...props }: AuthFieldProps) {
  const fieldId = id || name;
  const errorId = `${fieldId}-error`;

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium" htmlFor={fieldId}>
        {label}
      </label>
      <input
        aria-describedby={error ? errorId : undefined}
        aria-invalid={Boolean(error)}
        className={cn(
          "h-10 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20",
          error && "border-destructive focus:border-destructive focus:ring-destructive/20",
          className,
        )}
        id={fieldId}
        name={name}
        {...props}
      />
      {error ? (
        <p className="text-sm text-destructive" id={errorId}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

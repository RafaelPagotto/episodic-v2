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
          "field-focus h-11 w-full rounded-md border bg-background px-3 py-2 text-base sm:text-sm placeholder:text-muted-foreground",
          error && "border-destructive focus:border-destructive",
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

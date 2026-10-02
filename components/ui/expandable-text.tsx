import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

type ExpandableTextProps = {
  className?: string;
  label?: string;
  preview?: boolean;
  text: string;
};

/** Native disclosures keep full descriptions accessible without adding client state. */
export function ExpandableText({ className, label = "Read more", preview = true, text }: ExpandableTextProps) {
  if (preview && text.length <= 160) {
    return <p className={cn("break-words text-sm text-muted-foreground", className)}>{text}</p>;
  }

  return (
    <details className={cn("group/description min-w-0 text-sm text-muted-foreground", className)}>
      <summary className="cursor-pointer list-none rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        {preview ? <span className="line-clamp-2 break-words group-open/description:hidden">{text}</span> : null}
        <span className="inline-flex min-h-11 items-center gap-1.5 font-medium text-foreground">
          <span className="group-open/description:hidden">{label}</span>
          <span className="hidden group-open/description:inline">Show less</span>
          <ChevronDown aria-hidden="true" className="size-4 transition-transform group-open/description:rotate-180 motion-reduce:transition-none" />
        </span>
      </summary>
      <p className="break-words leading-6">{text}</p>
    </details>
  );
}

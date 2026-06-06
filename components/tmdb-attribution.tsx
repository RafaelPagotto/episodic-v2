import Image from "next/image";
import { ExternalLink } from "lucide-react";

import { TMDB_ATTRIBUTION, TMDB_LOGO_PATH } from "@/lib/tmdb/attribution";
import { cn } from "@/lib/utils";

type TmdbAttributionProps = {
  className?: string;
  tmdbId?: number;
};

export function TmdbAttribution({ className, tmdbId }: TmdbAttributionProps) {
  const sourceUrl = tmdbId
    ? `${TMDB_ATTRIBUTION.sourceUrl}/tv/${tmdbId}`
    : TMDB_ATTRIBUTION.sourceUrl;

  return (
    <aside
      aria-label="TMDB attribution"
      className={cn(
        "flex flex-col gap-1 border-t pt-4 text-xs leading-5 text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:gap-4",
        className,
      )}
    >
      <p>{TMDB_ATTRIBUTION.notice}</p>
      <a
        className="inline-flex shrink-0 items-center gap-1 font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        href={sourceUrl}
        rel="noopener noreferrer"
        target="_blank"
      >
        <Image
          alt={`${TMDB_ATTRIBUTION.sourceName} logo`}
          className="h-4 w-auto"
          height={12}
          src={TMDB_LOGO_PATH}
          width={92}
        />
        <span>View on {TMDB_ATTRIBUTION.sourceName}</span>
        <span className="sr-only"> (opens in a new tab)</span>
        <ExternalLink aria-hidden="true" className="size-3.5" />
      </a>
    </aside>
  );
}

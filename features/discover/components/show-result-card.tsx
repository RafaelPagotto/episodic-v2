"use client";

import { ListVideo, Loader2, Plus, Star } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FADED_SHOW_CARD_CLASS_NAME } from "@/features/preferences/card-appearance";
import { SearchSynopsis } from "@/features/search/components/search-synopsis";
import { getShowDetailHref } from "@/features/shows/routes";
import { isDateOnly } from "@/lib/date-only";
import { getTmdbImageUrl } from "@/lib/tmdb/images";
import type { NormalizedTmdbSearchResult } from "@/lib/tmdb/types";
import { cn } from "@/lib/utils";

export function showRating(show: Pick<NormalizedTmdbSearchResult, "voteAverage" | "voteCount">) {
  return show.voteAverage !== null && Number.isFinite(show.voteAverage) && show.voteAverage >= 0 && show.voteAverage <= 10 &&
    show.voteCount !== null && Number.isFinite(show.voteCount) && show.voteCount > 0 ? show.voteAverage.toFixed(1) : null;
}
export function ShowResultCard({ show, added, pending, faded, onAdd }: {
  show: NormalizedTmdbSearchResult; added: boolean; pending: boolean; faded: boolean; onAdd: () => void;
}) {
  const poster = getTmdbImageUrl(show.posterPath, "w342");
  const href = getShowDetailHref(show.tmdbId);
  const rating = showRating(show);
  const art = poster ? <Image alt={`${show.title} poster`} className="aspect-[2/3] w-full object-cover" width={342} height={513}
    sizes="(min-width: 1536px) 210px, (min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw" src={poster} /> :
    <div className="flex aspect-[2/3] items-center justify-center text-3xl font-semibold text-muted-foreground" aria-label="No poster available">{show.title.charAt(0)}</div>;
  return <Card className={cn("min-w-0 overflow-hidden", faded && FADED_SHOW_CARD_CLASS_NAME)}>
    <CardContent className="flex h-full flex-col gap-3 p-3 sm:p-4">
      {added ? <Link aria-label={`Track episodes for ${show.title}`} className="poster-link poster-surface bg-secondary" href={href} prefetch={false}>{art}</Link> :
        <div className="overflow-hidden rounded-md bg-secondary">{art}</div>}
      <h3 className="line-clamp-2 min-h-10 break-words text-sm font-semibold leading-5 sm:text-base" title={show.title}>
        {added ? <Link className="title-link" href={href} prefetch={false}>{show.title}</Link> : show.title}
      </h3>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>{isDateOnly(show.firstAirDate) ? show.firstAirDate.slice(0, 4) : "Year unknown"}</span>
        <span className="inline-flex items-center gap-1" aria-label={rating ? `TMDB rating ${rating} out of 10` : "Not rated"}
          title={rating ? `${show.voteCount} TMDB votes` : undefined}>
          {rating ? <Star aria-hidden="true" className="size-3 text-amber-500" /> : null}{rating ?? "Not rated"}
        </span>
      </div>
      <SearchSynopsis showTitle={show.title} text={show.overview || "No overview available."} />
      <div className="mt-auto pt-1">
        {added ? <Button asChild className="h-11 w-full gap-2" size="sm"><Link aria-label={`Track episodes for ${show.title}`} href={href} prefetch={false}>
          <ListVideo aria-hidden="true" className="size-4" />Track</Link></Button> :
          <Button aria-label={`${pending ? "Adding" : "Add"} ${show.title}`} aria-busy={pending} className="h-11 w-full gap-2" disabled={pending} onClick={onAdd} size="sm" type="button">
            {pending ? <Loader2 aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" /> : <Plus aria-hidden="true" className="size-4" />}{pending ? "Adding" : "Add"}
          </Button>}
      </div>
    </CardContent>
  </Card>;
}

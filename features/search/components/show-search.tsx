"use client";

import { ListVideo, Loader2, Plus, Search } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { FormEvent } from "react";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";
import { TmdbAttribution } from "@/components/tmdb-attribution";
import type { UserPreferences } from "@/features/preferences/types";
import { shouldFadeAddedForPreferences, shouldHideAddedForPreferences } from "@/features/preferences/view-model";
import { getShowDetailHref } from "@/features/shows";
import { getTmdbImageUrl } from "@/lib/tmdb/images";
import type { NormalizedTmdbSearchResponse, NormalizedTmdbSearchResult } from "@/lib/tmdb/types";
import { cn } from "@/lib/utils";

import { addShowToLibraryAction } from "../actions";
import type { SearchCardMessage } from "../types";

type ShowSearchProps = {
  initialAddedShowIds: number[];
  preferences: UserPreferences;
};

type SearchStatus = "empty" | "error" | "idle" | "loading" | "success";

type SearchErrorResponse = {
  error?: {
    message?: string;
  };
};

async function readSearchError(response: Response) {
  try {
    const body = (await response.json()) as SearchErrorResponse;
    return body.error?.message || "Unable to search TMDB.";
  } catch {
    return "Unable to search TMDB.";
  }
}

function getYear(date: string | null) {
  return date ? date.slice(0, 4) : null;
}

function ShowPoster({ show }: { show: NormalizedTmdbSearchResult }) {
  const posterUrl = getTmdbImageUrl(show.posterPath, "w185");

  if (!posterUrl) {
    return (
      <div className="flex aspect-[2/3] w-24 shrink-0 items-center justify-center rounded-md bg-secondary text-xl font-semibold text-muted-foreground">
        {show.title.charAt(0)}
      </div>
    );
  }

  return (
    <Image
      alt={`${show.title} poster`}
      className="aspect-[2/3] w-24 shrink-0 rounded-md object-cover"
      height={278}
      sizes="96px"
      src={posterUrl}
      width={185}
    />
  );
}

export function ShowSearch({ initialAddedShowIds, preferences }: ShowSearchProps) {
  const [addedShowIds, setAddedShowIds] = useState(() => new Set(initialAddedShowIds));
  const [cardMessages, setCardMessages] = useState<Record<number, SearchCardMessage>>({});
  const [errorMessage, setErrorMessage] = useState("");
  const [, startTransition] = useTransition();
  const [pendingTmdbId, setPendingTmdbId] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<NormalizedTmdbSearchResult[]>([]);
  const [status, setStatus] = useState<SearchStatus>("idle");
  const visibleResults = results.filter((show) =>
    !shouldHideAddedForPreferences(addedShowIds.has(show.tmdbId), preferences),
  );

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedQuery = query.trim();

    if (!trimmedQuery) {
      setResults([]);
      setStatus("idle");
      setErrorMessage("");
      return;
    }

    setStatus("loading");
    setErrorMessage("");
    setCardMessages({});

    const params = new URLSearchParams({
      query: trimmedQuery,
    });

    try {
      const response = await fetch(`/api/tmdb/search?${params.toString()}`);

      if (!response.ok) {
        throw new Error(await readSearchError(response));
      }

      const body = (await response.json()) as NormalizedTmdbSearchResponse;
      setResults(body.results);
      setStatus(body.results.length > 0 ? "success" : "empty");
    } catch (error) {
      setResults([]);
      setErrorMessage(error instanceof Error ? error.message : "Unable to search TMDB.");
      setStatus("error");
    }
  }

  function handleAddShow(tmdbId: number) {
    if (addedShowIds.has(tmdbId) || pendingTmdbId) {
      return;
    }

    setPendingTmdbId(tmdbId);
    setCardMessages((current) => {
      const next = { ...current };
      delete next[tmdbId];
      return next;
    });

    startTransition(() => {
      void (async () => {
        try {
          const result = await addShowToLibraryAction(tmdbId);

          if (result.status === "success" || result.status === "duplicate") {
            setAddedShowIds((current) => new Set(current).add(tmdbId));
            setCardMessages((current) => ({
              ...current,
              [tmdbId]: {
                message: result.message,
                status: "success",
              },
            }));
          } else {
            setCardMessages((current) => ({
              ...current,
              [tmdbId]: {
                message: result.message,
                status: "error",
              },
            }));
          }
        } catch {
          setCardMessages((current) => ({
            ...current,
            [tmdbId]: {
              message: "Unable to add this show right now.",
              status: "error",
            },
          }));
        } finally {
          setPendingTmdbId(null);
        }
      })();
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <form className="flex flex-col gap-3 sm:flex-row" onSubmit={handleSearch}>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            aria-label="Search TV shows"
            className="h-10 w-full rounded-md border bg-background px-9 py-2 text-sm outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search TV shows"
            type="search"
            value={query}
          />
        </div>
        <Button className="gap-2 sm:w-32" disabled={status === "loading"} type="submit">
          {status === "loading" ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
          Search
        </Button>
      </form>

      <TmdbAttribution />

      {status === "idle" ? (
        <EmptyState description="Search by show title to find TMDB matches." title="Find a show" />
      ) : null}

      {status === "loading" ? (
        <Notice>
          <span className="flex items-center gap-2">
            <Loader2 className="size-4 animate-spin" />
            Searching TMDB...
          </span>
        </Notice>
      ) : null}

      {status === "empty" ? (
        <EmptyState description="Check the spelling or try a shorter title." title="No shows found" />
      ) : null}

      {status === "error" ? (
        <Notice tone="error">{errorMessage}</Notice>
      ) : null}

      {status === "success" && visibleResults.length === 0 ? (
        <EmptyState
          description="Your current preferences hide shows that are already in your library."
          title="All matching shows are already added"
        />
      ) : null}

      {status === "success" && visibleResults.length > 0 ? (
        <div className="grid gap-3">
          {visibleResults.map((show) => {
            const isAdded = addedShowIds.has(show.tmdbId);
            const isAdding = pendingTmdbId === show.tmdbId;
            const cardMessage = cardMessages[show.tmdbId];
            const detailHref = getShowDetailHref(show.tmdbId);
            const year = getYear(show.firstAirDate);

            return (
              <Card
                key={show.tmdbId}
                className={cn("overflow-hidden", shouldFadeAddedForPreferences(isAdded, preferences) && "opacity-60")}
              >
                <CardContent className="flex gap-4 p-4 sm:p-5">
                  <ShowPoster show={show} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <h2 className="truncate text-base font-semibold">
                          {show.title}
                          {year ? <span className="ml-2 text-sm font-normal text-muted-foreground">{year}</span> : null}
                        </h2>
                        {show.originalTitle && show.originalTitle !== show.title ? (
                          <p className="mt-1 truncate text-sm text-muted-foreground">{show.originalTitle}</p>
                        ) : null}
                      </div>
                      {isAdded ? (
                        <Button asChild className="w-full gap-2 sm:w-32">
                          <Link
                            aria-label={`Track episodes for ${show.title}`}
                            href={detailHref}
                          >
                            <ListVideo className="size-4" />
                            Track
                          </Link>
                        </Button>
                      ) : (
                        <Button
                          className="w-full gap-2 sm:w-28"
                          disabled={isAdding}
                          onClick={() => handleAddShow(show.tmdbId)}
                          type="button"
                        >
                          {isAdding ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                          {isAdding ? "Adding" : "Add"}
                        </Button>
                      )}
                    </div>
                    <p className="mt-3 line-clamp-3 text-sm text-muted-foreground">
                      {show.overview || "No overview available."}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                      {show.originalLanguage ? <span>{show.originalLanguage.toUpperCase()}</span> : null}
                      {show.voteAverage ? <span>{show.voteAverage.toFixed(1)} rating</span> : null}
                    </div>
                    {cardMessage ? (
                      <p
                        className={cn(
                          "mt-3 text-sm",
                          cardMessage.status === "error" ? "text-destructive" : "text-primary",
                        )}
                        role={cardMessage.status === "error" ? "alert" : "status"}
                      >
                        {cardMessage.message}
                      </p>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

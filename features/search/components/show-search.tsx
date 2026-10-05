"use client";

import { ListVideo, Loader2, Plus, Search } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { FormEvent } from "react";
import { useEffect, useState, useTransition } from "react";

import {
  ACTION_FEEDBACK_AUTO_DISMISS_MS,
  ActionFeedback,
} from "@/components/ui/action-feedback";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ExpandableText } from "@/components/ui/expandable-text";
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
import { forgetSearchResults, getSearchHref, readSearchResults, rememberSearchResults } from "../search-session";

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

function ShowPoster({
  detailHref,
  faded,
  isAdded,
  show,
}: {
  detailHref: string;
  faded: boolean;
  isAdded: boolean;
  show: NormalizedTmdbSearchResult;
}) {
  const posterUrl = getTmdbImageUrl(show.posterPath, "w342");
  const content = posterUrl ? (
    <Image
      alt={`${show.title} poster`}
      className={cn("aspect-[2/3] w-full object-cover", faded && "opacity-50", isAdded && "transition group-hover:scale-[1.02]")}
      height={513}
      sizes="(min-width: 1280px) 18vw, (min-width: 1024px) 22vw, (min-width: 768px) 30vw, 45vw"
      src={posterUrl}
      width={342}
    />
  ) : (
    <div className={cn("flex aspect-[2/3] items-center justify-center text-3xl font-semibold text-muted-foreground", faded && "opacity-50", isAdded && "transition group-hover:scale-[1.02]")}>
      {show.title.charAt(0)}
    </div>
  );

  if (isAdded) {
    return (
      <Link
        aria-label={`Track episodes for ${show.title}`}
        className="group block overflow-hidden rounded-md bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        href={detailHref}
      >
        {content}
      </Link>
    );
  }

  return <div className="group overflow-hidden rounded-md bg-secondary">{content}</div>;
}

export function ShowSearch({ initialAddedShowIds, preferences }: ShowSearchProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const submittedQuery = (searchParams.get("q") ?? "").trim();
  const [addedShowIds, setAddedShowIds] = useState(() => new Set(initialAddedShowIds));
  const [cardMessages, setCardMessages] = useState<Record<number, SearchCardMessage>>({});
  const [errorMessage, setErrorMessage] = useState("");
  const [, startTransition] = useTransition();
  const [pendingTmdbId, setPendingTmdbId] = useState<number | null>(null);
  const [query, setQuery] = useState(submittedQuery);
  const [searchAttempt, setSearchAttempt] = useState(0);
  const [results, setResults] = useState<NormalizedTmdbSearchResult[]>(() => readSearchResults(submittedQuery) ?? []);
  const [status, setStatus] = useState<SearchStatus>(() => {
    if (!submittedQuery) return "idle";
    const cached = readSearchResults(submittedQuery);
    return cached ? (cached.length ? "success" : "empty") : "loading";
  });
  const visibleResults = results.filter((show) =>
    !shouldHideAddedForPreferences(addedShowIds.has(show.tmdbId), preferences),
  );

  useEffect(() => {
    setQuery(submittedQuery);
    setErrorMessage("");
    setCardMessages({});
    if (!submittedQuery) {
      setResults([]);
      setStatus("idle");
      return;
    }
    const cached = readSearchResults(submittedQuery);
    if (cached) {
      setResults(cached);
      setStatus(cached.length ? "success" : "empty");
      return;
    }
    const controller = new AbortController();
    let cancelled = false;
    setResults([]);
    setStatus("loading");
    void (async () => {
      try {
        const params = new URLSearchParams({ query: submittedQuery });
        const response = await fetch(`/api/tmdb/search?${params}`, { signal: controller.signal });
        if (!response.ok) throw new Error(await readSearchError(response));
        const body = (await response.json()) as NormalizedTmdbSearchResponse;
        if (cancelled) return;
        rememberSearchResults(submittedQuery, body.results);
        setResults(body.results);
        setStatus(body.results.length ? "success" : "empty");
      } catch (error) {
        if (cancelled) return;
        setResults([]);
        setErrorMessage(error instanceof Error ? error.message : "Unable to search TMDB.");
        setStatus("error");
      }
    })();
    return () => { cancelled = true; controller.abort(); };
  }, [submittedQuery, searchAttempt]);

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedQuery = query.trim();
    if (trimmedQuery === submittedQuery) {
      forgetSearchResults(trimmedQuery);
      setSearchAttempt((attempt) => attempt + 1);
    } else {
      window.history.replaceState(null, "", getSearchHref(pathname, searchParams.toString(), trimmedQuery, window.location.hash));
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
            className="h-11 w-full rounded-md border bg-background px-9 py-2 text-base outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 sm:text-sm"
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
        <ActionFeedback dismissible feedbackKey={errorMessage} presentation="toast" tone="error">
          {errorMessage}
        </ActionFeedback>
      ) : null}

      {Object.entries(cardMessages).map(([tmdbId, cardMessage]) => (
        <ActionFeedback
          key={tmdbId}
          autoDismissMs={cardMessage.status === "success" ? ACTION_FEEDBACK_AUTO_DISMISS_MS : undefined}
          dismissible
          feedbackKey={cardMessage}
          presentation="toast"
          tone={cardMessage.status === "error" ? "error" : "success"}
        >
          {cardMessage.message}
        </ActionFeedback>
      ))}

      {status === "success" && visibleResults.length === 0 ? (
        <EmptyState
          description="Your current preferences hide shows that are already in your library."
          title="All matching shows are already added"
        />
      ) : null}

      {status === "success" && visibleResults.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
          {visibleResults.map((show) => {
            const isAdded = addedShowIds.has(show.tmdbId);
            const isAdding = pendingTmdbId === show.tmdbId;
            const detailHref = getShowDetailHref(show.tmdbId);
            const year = getYear(show.firstAirDate);

            return (
              <Card
                key={show.tmdbId}
                className="overflow-hidden"
              >
                <CardContent className="flex h-full flex-col gap-3 p-3 sm:p-4">
                  <ShowPoster detailHref={detailHref} faded={shouldFadeAddedForPreferences(isAdded, preferences)} isAdded={isAdded} show={show} />
                  <div className="flex min-h-0 flex-1 flex-col gap-3">
                    <div className="min-w-0">
                      <h2 className="min-h-10 text-sm font-semibold leading-5 sm:text-base">
                        {isAdded ? (
                          <Link
                            aria-label={`Track episodes for ${show.title}`}
                            className="line-clamp-2 rounded-sm underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            href={detailHref}
                          >
                            {show.title}
                          </Link>
                        ) : (
                          <span className="line-clamp-2">{show.title}</span>
                        )}
                      </h2>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                        {year ? <span className="rounded-full border px-2 py-1">{year}</span> : null}
                        {show.originalLanguage ? (
                          <span className="rounded-full border px-2 py-1">{show.originalLanguage.toUpperCase()}</span>
                        ) : null}
                      </div>
                    </div>

                    <ExpandableText className="text-xs sm:text-sm" label="Synopsis" text={show.overview || "No overview available."} />

                    <div className="mt-auto">
                      {isAdded ? (
                        <Button asChild className="h-11 w-full gap-2" size="sm">
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
                          className="h-11 w-full gap-2"
                          disabled={isAdding}
                          onClick={() => handleAddShow(show.tmdbId)}
                          size="sm"
                          type="button"
                        >
                          {isAdding ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                          {isAdding ? "Adding" : "Add"}
                        </Button>
                      )}
                    </div>
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

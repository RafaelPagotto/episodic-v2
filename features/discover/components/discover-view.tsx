"use client";

import { ArrowLeft, RotateCw, Search, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, use, useEffect, useRef, useState, type FormEvent, type RefObject } from "react";
import { ActionFeedback, ACTION_FEEDBACK_AUTO_DISMISS_MS } from "@/components/ui/action-feedback";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { TmdbAttribution } from "@/components/tmdb-attribution";
import type { UserPreferences } from "@/features/preferences/types";
import { shouldFadeAddedForPreferences, shouldHideAddedForPreferences } from "@/features/preferences/view-model";
import { addShowToLibraryAction } from "@/features/search/actions";
import type { NormalizedTmdbSearchResponse } from "@/lib/tmdb/types";
import { cn } from "@/lib/utils";
import { discoverHref, discoverKey, discoverRequest, parseDiscoverState, type DiscoverState } from "../state";
import { updateDiscoverHistory } from "../history";
import { beginDiscoverVisit, clearDiscoverVisit, forgetListing, readFeedPage, readListing, readPosition, rememberFeedPage, rememberListing, rememberNavigationPosition, rememberPosition } from "../session";
import { DISCOVER_FEEDS, type DiscoverResponse, type ListingResult } from "../types";
import { DiscoverSkeleton } from "./discover-skeleton";
import { DiscoverPagination } from "./discover-pagination";
import { ShowResultCard } from "./show-result-card";

const FEED_LABELS = { trending: "Trending This Week", popular: "Popular", "top-rated": "Top Rated" };
export type DiscoverViewProps = {
  accountScope: string; demo: boolean; initialState: DiscoverState;
  initialListing: Promise<ListingResult>; initialAddedShowIds: number[];
  preferences: UserPreferences;
};

export function DiscoverView(props: DiscoverViewProps) {
  const params = useSearchParams();
  const rawParams = params.toString();
  const state = parseDiscoverState(new URLSearchParams(rawParams), props.demo);
  const key = discoverKey(state, props.demo);
  const initialKey = discoverKey(props.initialState, props.demo);
  const [query, setQuery] = useState(state.q);
  const [attempt, setAttempt] = useState(0);
  const [added, setAdded] = useState(() => new Set(props.initialAddedShowIds));
  const [pending, setPending] = useState<number | null>(null);
  const pendingRef = useRef(false);
  const active = useRef(true);
  const interaction = useRef(0);
  const [feedback, setFeedback] = useState<{ message: string; status: "success" | "error" } | null>(null);
  const initialAllowed = useRef(true);
  const lastKey = useRef(initialKey);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const searchRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const canonicalHref = discoverHref(state);
  useEffect(() => { setAdded(new Set(props.initialAddedShowIds)); }, [props.initialAddedShowIds]);
  useEffect(() => {
    active.current = true;
    const record = () => { interaction.current += 1; };
    const events = ["pointerdown", "keydown", "wheel", "touchstart"];
    for (const event of events) window.addEventListener(event, record, { capture: true, passive: true });
    return () => {
      active.current = false;
      for (const event of events) window.removeEventListener(event, record, true);
    };
  }, []);
  // URL changes, including browser Back/Forward, remain authoritative.
  useEffect(() => { setQuery(state.q); }, [state.q]);
  useEffect(() => {
    beginDiscoverVisit(props.accountScope);
    if (key !== lastKey.current) initialAllowed.current = false;
    lastKey.current = key;
    if (!state.q) rememberFeedPage(state.feed, state.page);
    const canonical = canonicalHref + window.location.hash;
    if (window.location.search === (rawParams ? `?${rawParams}` : "") &&
        window.location.pathname + window.location.search + window.location.hash !== canonical) {
      updateDiscoverHistory("replaceState", canonical);
    }
    const save = () => {
      if (window.location.pathname === "/discover" && discoverKey(parseDiscoverState(new URLSearchParams(window.location.search), props.demo), props.demo) === key) rememberPosition(key, window.scrollY);
    };
    window.addEventListener("scroll", save, { passive: true });
    window.addEventListener("pagehide", save);
    return () => { window.removeEventListener("scroll", save); window.removeEventListener("pagehide", save); };
  }, [key, props.accountScope, props.demo, state.feed, state.page, state.q, canonicalHref, rawParams]);

  function navigate(next: DiscoverState) {
    rememberNavigationPosition(state, next, props.demo, window.scrollY);
    initialAllowed.current = false;
    const href = discoverHref(next, window.location.hash);
    if (href !== window.location.pathname + window.location.search + window.location.hash) {
      updateDiscoverHistory("pushState", href);
    }
  }
  function retry() { forgetListing(key); setAttempt((value) => value + 1); }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const q = query.trim();
    if (q === state.q && state.q) retry();
    else navigate({ ...state, q, searchPage: 1 });
  }
  function expire() { clearDiscoverVisit(); router.replace("/sign-in"); router.refresh(); }
  function clearSearch() {
    navigate({ ...state, q: "", searchPage: 1 });
    searchRef.current?.focus();
  }
  async function add(tmdbId: number) {
    if (pendingRef.current || added.has(tmdbId)) return;
    pendingRef.current = true; setPending(tmdbId); setFeedback(null);
    const focused = document.activeElement;
    const startedInteraction = interaction.current;
    try {
      const outcome = await addShowToLibraryAction(tmdbId);
      if (!active.current) return;
      if (outcome.status === "success" || outcome.status === "duplicate") {
        setAdded((current) => new Set(current).add(tmdbId));
        setFeedback({ status: "success", message: outcome.message });
        if (props.preferences.hideAdded && interaction.current === startedInteraction &&
            (document.activeElement === focused || document.activeElement === document.body)) requestAnimationFrame(() => {
          if (active.current && interaction.current === startedInteraction && document.activeElement === document.body) document.getElementById("discover-results")?.focus();
        });
      } else setFeedback({ status: "error", message: outcome.message });
    } catch { if (active.current) setFeedback({ status: "error", message: "Unable to add this show right now." }); }
    finally { pendingRef.current = false; if (active.current) setPending(null); }
  }
  return <section aria-label="Discover" className="mx-auto flex w-full max-w-6xl flex-col gap-5" onClickCapture={(event) => {
    if ((event.target as Element).closest('a[href^="/shows/"]')) rememberPosition(key, window.scrollY);
  }}>
    <h1 className="text-2xl font-semibold">Discover</h1>
    <form action="/discover" className="flex gap-2" method="get" onSubmit={submit}>
      {state.feed !== "trending" ? <input name="feed" type="hidden" value={state.feed} /> : null}
      {state.page !== 1 ? <input name="page" type="hidden" value={state.page} /> : null}
      <div className="relative min-w-0 flex-1">
        <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input aria-label={props.demo ? "Search demo shows" : "Search TV shows"}
          className="field-focus h-11 w-full rounded-md border bg-background py-2 pl-9 pr-12 text-base placeholder:text-muted-foreground sm:text-sm [&::-webkit-search-cancel-button]:hidden"
          maxLength={100} name="q" onChange={(event) => setQuery(event.target.value)} placeholder={props.demo ? "Search demo shows" : "Search TV shows"} ref={searchRef} type="search" value={query} />
        {state.q ? <Button aria-label="Clear search" className="absolute right-0 top-0" onClick={clearSearch} size="icon" title="Clear search" type="button" variant="ghost"><X aria-hidden="true" /></Button> : null}
      </div>
      <Button aria-label="Search" className="w-11 shrink-0 px-0 sm:w-auto sm:gap-2 sm:px-4" title="Search" type="submit"><Search aria-hidden="true" className="size-4" /><span className="hidden sm:inline">Search</span></Button>
    </form>
    {state.q ? <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="min-w-0 break-words text-lg font-semibold">Search results</h2>
      <Button className="gap-2" onClick={clearSearch} variant="ghost"><ArrowLeft aria-hidden="true" className="size-4" />Back to browsing</Button>
    </div> : props.demo ? <h2 className="text-lg font-semibold">Demo Picks</h2> :
      <div aria-label="Discover collections" className="grid grid-cols-3 border-b" role="tablist">
        {DISCOVER_FEEDS.map((feed, index) => <button aria-controls="discover-results" aria-label={FEED_LABELS[feed]} aria-selected={state.feed === feed}
          className={cn("min-h-11 min-w-0 border-b-2 px-1 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-4 sm:text-sm", state.feed === feed ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}
          id={`discover-tab-${feed}`} key={feed} onClick={() => navigate({ ...state, feed, page: readFeedPage(feed) })}
          onKeyDown={(event) => {
            let next: number | undefined;
            if (event.key === "ArrowRight") next = (index + 1) % 3;
            if (event.key === "ArrowLeft") next = (index + 2) % 3;
            if (event.key === "Home") next = 0;
            if (event.key === "End") next = 2;
            if (next !== undefined) { event.preventDefault(); tabRefs.current[next]?.focus(); navigate({ ...state, feed: DISCOVER_FEEDS[next], page: readFeedPage(DISCOVER_FEEDS[next]) }); }
          }} ref={(element) => { tabRefs.current[index] = element; }} role="tab" tabIndex={state.feed === feed ? 0 : -1} type="button">
          {feed === "trending" ? <><span className="sm:hidden">Trending</span><span className="hidden sm:inline">Trending This Week</span></> : FEED_LABELS[feed]}
        </button>)}
      </div>}
    <TmdbAttribution />
    <Suspense fallback={<div id="discover-results"><DiscoverSkeleton /></div>}>
      <DiscoverResults key={`${props.accountScope}:${key}`} {...props} state={state} resourceKey={key} attempt={attempt} retry={retry} navigate={navigate} expire={expire}
        added={added} pending={pending} add={add} interaction={interaction} seed={key === initialKey && initialAllowed.current ? props.initialListing : undefined} />
    </Suspense>
    {feedback ? <ActionFeedback autoDismissMs={feedback.status === "success" ? ACTION_FEEDBACK_AUTO_DISMISS_MS : undefined} dismissible feedbackKey={feedback} presentation="toast" tone={feedback.status}>{feedback.message}</ActionFeedback> : null}
  </section>;
}

type ResultsProps = DiscoverViewProps & { state: DiscoverState; resourceKey: string; attempt: number;
  seed?: Promise<ListingResult>; retry: () => void; navigate: (state: DiscoverState) => void; expire: () => void;
  added: Set<number>; pending: number | null; add: (tmdbId: number) => Promise<void>; interaction: RefObject<number> };
function DiscoverResults(props: ResultsProps) {
  const seed = props.seed ? use(props.seed) : undefined;
  const [result, setResult] = useState<ListingResult | null>(() => seed ?? null);
  const [loading, setLoading] = useState(!seed);
  const [retryAt, setRetryAt] = useState(0);
  const [retryWait, setRetryWait] = useState(false);
  const region = useRef<HTMLDivElement>(null);
  const startedInteraction = useRef(props.interaction.current);
  const seedAttempt = useRef(props.attempt);
  const queryMode = Boolean(props.state.q);
  const currentPage = queryMode ? props.state.searchPage : props.state.page;

  useEffect(() => {
    beginDiscoverVisit(props.accountScope);
    const controller = new AbortController();
    let cancelled = false;
    const cached = props.demo ? null : readListing(props.resourceKey);
    const initial = props.attempt === seedAttempt.current ? seed : undefined;
    if (initial || cached) {
      const next = initial ?? { data: cached! };
      setResult(next); setLoading(false);
      if (next.error?.retryAfter) setRetryAt(Date.now() + next.error.retryAfter * 1000);
      if (!props.demo && initial?.data) rememberListing(props.resourceKey, initial.data);
    } else {
      setLoading(true); setResult(null);
      void (async () => {
        try {
          const response = await fetch(discoverRequest(props.state, props.demo), { signal: controller.signal, cache: "no-store" });
          if (cancelled) return;
          if (response.status === 401) { props.expire(); return; }
          if (!response.ok) {
            const wait = Number(response.headers.get("Retry-After"));
            const retryAfter = Number.isFinite(wait) && wait > 0 ? Math.min(wait, 3600) : 0;
            setRetryAt(Date.now() + retryAfter * 1000);
            setResult({ error: { status: response.status, message: response.status === 429 ? "Too many requests. Please try again shortly." : "Shows are unavailable right now. Please try again." } });
          } else {
            const data = await response.json() as NormalizedTmdbSearchResponse | DiscoverResponse;
            if (cancelled) return;
            if (!props.demo) rememberListing(props.resourceKey, data);
            setResult({ data });
          }
        } catch {
          if (!cancelled) setResult({ error: { status: 503, message: "Shows are unavailable right now. Please try again." } });
        } finally { if (!cancelled) setLoading(false); }
      })();
    }
    return () => { cancelled = true; controller.abort(); };
    // Resource identity includes every request parameter; callbacks do not trigger fetches.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.resourceKey, props.attempt, props.accountScope]);

  useEffect(() => {
    if (!loading && result?.data) {
      const y = readPosition(props.resourceKey);
      if (y !== undefined || !seed) {
        const frame = requestAnimationFrame(() => {
          if (props.interaction.current === startedInteraction.current) {
            window.scrollTo({ top: Math.min(y ?? 0, Math.max(0, document.documentElement.scrollHeight - window.innerHeight)), behavior: "instant" });
            if (!seed && document.activeElement === document.body) region.current?.focus({ preventScroll: true });
          }
        });
        return () => cancelAnimationFrame(frame);
      }
    }
  }, [loading, result, props.resourceKey, props.interaction, seed]);
  useEffect(() => {
    const remaining = retryAt - Date.now();
    if (remaining <= 0) { setRetryWait(false); return; }
    setRetryWait(true);
    const timer = setTimeout(() => setRetryWait(false), remaining);
    return () => clearTimeout(timer);
  }, [retryAt]);

  const data = result?.data;
  const visible = data?.results.filter((show) => !shouldHideAddedForPreferences(props.added.has(show.tmdbId), props.preferences)) ?? [];
  const cap = data ? ("pagination" in data ? data.pagination.cap : props.demo ? 1 : Math.min(500, data.totalPages)) : 0;
  const changePage = (page: number) => props.navigate({ ...props.state, ...(queryMode ? { searchPage: page } : { page }) });
  return <div aria-busy={loading} aria-label={queryMode ? "Search results" : props.demo ? "Demo Picks" : FEED_LABELS[props.state.feed]}
    aria-labelledby={!queryMode && !props.demo ? `discover-tab-${props.state.feed}` : undefined} className="flex flex-col gap-5 focus:outline-none" id="discover-results" ref={region} role={!queryMode && !props.demo ? "tabpanel" : "region"} tabIndex={-1}>
    <p className="sr-only" role="status">{loading ? "Loading shows..." : result?.error ? "Shows unavailable." : `${visible.length} shows displayed. Page ${currentPage}.`}</p>
    {loading ? <DiscoverSkeleton announce={false} /> : result?.error ? <div className="flex flex-wrap items-center gap-3 rounded-md border p-4">
      <p className="text-sm">{result.error.message}</p><Button className="gap-2" disabled={retryWait} onClick={props.retry} variant="outline"><RotateCw aria-hidden="true" className="size-4" />Retry</Button>
    </div> : data ? <>
      {"freshness" in data && data.freshness === "stale" && data.fetchedAt ? <p className="text-xs text-muted-foreground">Last updated <time dateTime={data.fetchedAt}>{new Date(data.fetchedAt).toLocaleString("en-US", { timeZone: "UTC" })} UTC</time></p> : null}
      {!data.results.length ? <EmptyState title={queryMode ? "No shows found" : "No shows on this page"} description={queryMode ? "Check the spelling or try a shorter title." : "Try another collection or return to the first page."} /> :
        !visible.length ? <div className="py-8 text-center"><h3 className="font-semibold">All shows on this page are already added</h3><p className="mt-2 text-sm text-muted-foreground">Added shows are hidden by your preferences.</p><Link className="title-link mt-2 inline-flex min-h-11 items-center" href="/profile">Preferences</Link></div> :
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">{visible.map((show) => <ShowResultCard added={props.added.has(show.tmdbId)} faded={shouldFadeAddedForPreferences(props.added.has(show.tmdbId), props.preferences)} key={show.tmdbId} onAdd={() => void props.add(show.tmdbId)} pending={props.pending === show.tmdbId} show={show} />)}</div>}
      {!props.demo ? <DiscoverPagination currentPage={currentPage} lastPage={cap} onPageChange={changePage} /> : null}
    </> : null}
  </div>;
}

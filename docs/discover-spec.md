# Discover V1

Status: implemented and locally verified; preview staged. Production is unchanged.
Design direction: Option A, approved in conversation.
Technical evidence checked: 2026-10-22.

## Purpose And Boundaries

Discover helps people find shows to add. Dashboard helps them choose from their
existing library. Discover replaces the Search destination without changing
tracking or turning Dashboard into a discovery feed.

V1 includes title search, Trending This Week, Popular, Top Rated, the existing
expandable synopsis, library-aware Add/Track actions, and cached Demo Picks.

Out of scope: recommendations, provider availability, genre/year filters,
unadded-show detail pages or preview dialogs, infinite scrolling, featured heroes,
new user preferences, schema changes, metadata-refresh/cron changes, and tracking
or timezone changes. Browsing never imports or updates show/season/episode rows.

## Visual Contract

- Keep the current app shell, colour tokens, typography and content width.
- Use a compact Discover heading, persistent search form, feed tabs, one grid,
  and pagination where supported. No duplicate collection heading under a tab.
- Keep the existing responsive grid: two columns on phones, three at `sm`,
  four at `lg`, five at `2xl`, constrained by the current content width.
- Use actual 2:3 posters, up to two title lines, year, TMDB rating, the existing
  three-line expandable synopsis, and bottom-aligned Add/Track actions.
- Keep full titles accessible; missing posters have the existing neutral fallback.
- Show a rating to one decimal only for a finite value from 0 to 10 with a positive
  vote count. Otherwise show `Not rated`, not an invented zero. Give the star an
  accessible TMDB-rating label; vote count may be supplementary tooltip text.
- Use existing date-only validation for a premiere year. Do not parse a date-only
  value as a timestamp or introduce release/availability badges.
- Preserve the current theme support, restrained borders, and card radius.
- Added cards have one Track action, not a redundant In library button beside it.
  An existing-library indicator, if used, is display-only.
- Use Lucide Compass for Discover navigation, Search for search submission, and
  directional icons with accessible names for pagination and Back to browsing.
- Keep the existing desktop sidebar and mobile/touch bottom navigation. Compact
  mobile tabs may read Trending, Popular and Top rated; accessible names identify
  the weekly Trending window. Do not clip or horizontally scroll the tab strip.
- Keep TMDB attribution visible without competing with the search form.

The generated Option A mock-up is a composition reference, not a pixel-perfect
specification or a source of poster artwork, ratings, rankings or metadata.

## Navigation And Interaction

`/discover` is the canonical destination. `/search` remains a query-preserving
redirect, not a second implementation. Update navigation and internal entry links.

| Parameter | Meaning | Default / bounds |
| --- | --- | --- |
| `feed` | Remembered browse collection | `trending`; also `popular`, `top-rated` |
| `page` | Remembered browse page | 1; all three feeds 1-10 |
| `q` | Submitted search; nonempty value activates search mode | Trim; existing 100-character maximum |
| `searchPage` | Search page, independent of browse page | 1; existing API limit of 500 for permanent users |

Examples:

```text
/discover
/discover?feed=popular&page=3
/discover?feed=popular&page=3&q=dark&searchPage=2
```

In the last example, clearing search restores Popular page 3. A direct search link
with no browse parameters returns to Trending page 1. Omit default values in URLs.
Do not expose a language or adult-content setting in V1; UI requests use `en-US`.

| Event | Result |
| --- | --- |
| Open without a query | Load Trending This Week; no prefetch of the other feeds |
| Type | Change the input draft only; keep displayed results and URL unchanged |
| Submit a new query | Reset searchPage to 1, preserve browse feed/page, show search results instead of the feed |
| Submit the same query again | Retry that search key through the existing search path; do not invalidate shared discovery caches |
| Enter search mode | Hide feed tabs; show Search results and Back to browsing |
| Clear and submit, or activate Clear search | Remove q/searchPage and restore remembered browse state |
| Back to browsing | Navigate to the remembered browse URL, not blindly to a previous external history entry |
| Switch a feed | Restore that feed's last page during this visit, keeping the current viewport/tab-strip position; a never-visited feed starts on page 1 |
| Previous/Next | Request only the selected page and preserve the current mode |
| First/Last | Jump directly to page 1 or the existing supported last-page limit for the current mode; do not fetch intervening pages |
| Open Show Detail, then return | Restore the result page, available results and prior position |
| Browser Back/Forward | Derive mode, query and selected page from the URL; do not overwrite history with stale component state |
| Reload | Restore collection/query/page from the URL; refetch if necessary; cached results are not required for correctness |

Use history entries for committed navigation, not keystrokes. Use replacement only
for canonicalizing invalid/default URL state or storing position on an existing
entry. Keep unrelated history state intact. Empty submitted queries mean browsing,
not a failing request to the search API.

Use one explicit accessible Clear search icon command when a query is active;
do not rely on browser-specific native clear events. Merely editing the draft to
an empty value still waits for submit. Keep input padding and touch targets stable.

Invalid page URLs normalize to page 1 for their mode; invalid feeds normalize to
Trending. Canonicalization must not create redirect loops. APIs return controlled
400 errors for invalid parameters instead of silently accepting them.

Remember scroll and per-feed page state only for the current tab/visit in bounded
memory. Preserve compatible browser scroll restoration; do not install a global
scroll-restoration override affecting other pages. Clamp restored positions if the
list has changed. Precise position across a hard reload is best effort; the URL's
mode and selected page are guaranteed. No cookies, tokens, membership, preferences
or guest result sets are stored in localStorage/sessionStorage.

Explicit feed-tab switches do not restore a historical feed scroll offset: doing
so could move the heading/search offscreen merely by selecting Popular. Mouse and
keyboard switches share this behavior. Search, pagination and browser-history
restoration retain their existing position behavior.

Client result snapshots retain only public TMDB listing data, for at most eight
feed/query/page keys and five minutes, following the existing bounded search-cache
pattern. Keys include mode, feed or submitted query, page and language. Recheck
feed age limits on reuse. Clear account-scoped navigation state on sign-out,
account change, guest expiry or reset; never restore stale membership from it.

Cancel obsolete requests and disregard late responses even if cancellation loses
a race. Hydration must not immediately refetch the listing just supplied by the
server. Do not prefetch imports, episode details or all feed pages.

## Feed Sources And Pagination

| Feed | TMDB endpoint | Pagination offered | Revalidate after | Maximum served age |
| --- | --- | --- | --- | --- |
| Trending This Week | `/trending/tv/week` | Pages 1-10, bounded by upstream total | 6 hours | 24 hours |
| Popular | `/tv/popular` | Pages 1-10, bounded by upstream total | 6 hours | 24 hours |
| Top Rated | `/tv/top_rated` | Pages 1-10, bounded by upstream total | 24 hours | 72 hours |

TMDB's reference and OpenAPI schema document `language` but not `page` for
Trending TV. Popular and Top Rated document both. A read-only live probe on
2026-10-22 verified weekly Trending with explicit pages 1 and 2: both returned
20 entries, the matching response page, 500 total pages, and distinct nonoverlapping
ID sets. No titles were imported or written to the database for this check.

V1 therefore offers the same bounded pagination for all three feeds. Trending's
undocumented parameter remains a compatibility risk: validate that the response
page matches the requested page, cover it with fixtures, and repeat the two-page
read-only contract check before release. A mismatch is a controlled unavailable
response, not page 1 silently displayed as another page. Do not hardcode the
observed 500-page upstream total; enforce the smaller V1 cap of 10.

Use TMDB's list order and Top Rated eligibility; do not invent a recommendation
score, custom vote threshold or popularity ranking. These are TMDB signals, not
streaming-platform audience figures or local-country charts.

Preserve one upstream page at a time, up to 20 normalized results, with stable
TMDB-ID deduplication. Pagination availability comes from the supported feed,
upstream totals and V1 cap, not the number of visible cards after preferences.
Do not refill hidden cards by fetching additional pages. Do not invent a full
filtered-result total from a partial upstream page.

Keep pagination usable when preferences hide every card. For genuinely empty
pages, retain a route back to page 1. Do not silently redirect on upstream errors.

## Data And Security Contract

Add a server-only listing adapter alongside existing TMDB functions. Reuse the
normalized search-result shape and attribution instead of another show model.
Do not change `requestTmdbOnce` caching globally: search, import and metadata
refresh retain their existing behavior.

The new `GET /api/tmdb/discover` contract is:

- Valid permanent-user feeds: `trending`, `popular`, `top-rated`.
- Guest feed: `demo` only, page 1; permanent users do not need this feed.
- V1 language: `en-US` only; an omitted language selects it.
- Strict positive integer pages; reject duplicate recognized parameters and
  unsupported feed/language/page combinations before touching the upstream/cache.
- Do not accept arbitrary TMDB paths, sort expressions, provider filters or an
  adult-content override. Default ordinary lists to TMDB's non-adult behavior;
  discard entries explicitly marked adult before normalizing. This is not an
  age-rating or family-suitability guarantee.
- Require the existing trusted Auth/guest-readiness check before every response,
  including shared-cache hits. Missing, unverifiable or expired sessions fail closed.
- An anonymous request for a global feed returns safe 403 feedback before any
  TMDB call. Do not switch to permanent-user feeds if guest data loading fails.
- Return the normalized page envelope plus `feed`, `source` (`tmdb` or `demo`),
  `fetchedAt` (successful TMDB fetch timestamp, null for the local catalogue),
  `freshness` (`fresh`, `stale`, `local`), and pagination capability/cap/next/previous
  metadata. Preserve upstream totals separately from offered pagination bounds.
- Use private/no-store HTTP responses for the authenticated endpoint and dynamic
  page. Shared reuse happens in the internal public-data cache, not a public CDN
  response containing account information.
- Reuse the existing safe error envelope. Return 400 for invalid requests, 401
  for no active session, 403 for forbidden guest feeds, 429 for throttling, and
  503 for unavailable/over-age listings. Do not return raw upstream errors.

Add a separate `discover` limiter scope: initially 30 requests per minute per
user, separate from search/add/manual refresh. Match the current implementation
without treating its process-local Map as a distributed quota. Bound cache keys
and request parameters as additional controls. Honor upstream 429/backoff without
automatic request loops, bulk fan-out or per-card detail requests. Use one bounded
upstream attempt with a ten-second timeout on a cache miss; retries are explicit.

Keep logs to safe error codes, feed, page, duration and aggregate cache outcomes.
Never log request URLs containing the TMDB key, Auth cookies/tokens, raw errors
containing credentials, personal search queries or library contents.

## Shared Cache Contract

Use Next.js 15's `unstable_cache` in a small server-only discovery data module,
not React request memoization or an unbounded module-local Map as the only cache.
Cache a successful normalized public response and its fetch timestamp, keyed by
a version, feed, page and fixed language. Keep secrets out of key arguments.

Read Auth, expiry, membership and preferences outside the cached callback. Cache
no Supabase clients, service-role access, request headers, user IDs, preferences,
guest rows or rendered personalized pages. The server page and API use the same
public listing service; the page does not make an HTTP request to its own API.

Revalidation is demand-driven, not a new cron. At the revalidation threshold a
previous response may be served while revalidation runs. A failed refresh must
throw, preserving the last successful value instead of caching an error/empty
fallback as a successful feed.

Next.js can retain stale data after revalidation errors. Therefore revalidate
settings alone do not enforce the table's maximum age: check the cached
`fetchedAt` after every cache read. At age >= maximum, do not serve those results;
return the controlled unavailable state while allowing framework revalidation.
Do not rewrite fetchedAt when returning stale data. Reject unusable timestamps.

Below the maximum, mark a response stale at age >= its revalidation interval.
Show a quiet last-updated indicator for stale content, without asserting a failed
refresh unless an error is actually known. A cold failure has no fabricated
fallback. Retry reuses the same key and normal cache policy, not global invalidation.

The intervals are elapsed-time cache policy, unrelated to profile timezones or
episode air dates. Never write `shows.last_synced_at` or season detail markers.
Verify this behavior under an actual Next.js production build, not mocks alone;
cache coalescing is an optimization, not a hard global TMDB-request guarantee.

## Library And Guest Behavior

Load membership with the authenticated RLS client, including all pages if a
library exceeds the Supabase row cap. Apply current hide-added/fade-added
preferences after the public listing is loaded. Do not introduce automatic hiding
of completed/dropped titles beyond the existing search preferences.

On Add, keep the existing action, duplicate protection, rate limits and import
behavior. Reserve the pending action, keep the card layout stable, and use the
existing safe feedback. Success/duplicate becomes Track; a failure retains Add
and does not claim membership. A hide-added preference may remove a successful
card; retain visible feedback and move focus to a sensible remaining target.
Do not otherwise replace or reorder cards on successful addition.

Revalidate `/discover` where the current add/remove/preferences/profile actions
revalidate `/search`, retaining compatibility for the legacy route. Update client
membership from current action results/server state, never a public feed snapshot.
If membership cannot be loaded, show a recoverable unavailable state rather than
present every title as unadded. Guest identity cannot fall back to ordinary mode.

Guests see the same search-first composition with a Demo Picks heading and no
global feed tabs. Use the existing 21-title catalogue in display order, with its
20 seeded titles and Fallout available to add. Present the complete small local
collection on one page, including query matches; no artificial Trending label or
global popularity claim. Existing hide/fade-added preferences still apply.

In guest page mode, ignore/canonicalize global feed/page parameters to the local
collection while preserving a valid query. Guest searchPage normalizes to 1. This
is page navigation behavior, not permission for the API to accept a global feed.

Use `searchDemoCatalogue` and `addCachedDemoShow`, and preserve all expiry/RLS/reset
checks. Direct API calls must not let a guest fetch global feeds, full TMDB details
or import/refresh metadata. No new catalogue entries, seed changes or migration
are needed. A new guest demonstrates the UI using cached metadata only.
On a later unauthorized/expired response, clear account-scoped UI state and return
to sign-in rather than continuing to display a cached guest session or retrying
with permanent-user behavior.

## Loading, Errors And Accessibility

- Initial loading: stable poster-shaped skeletons and an accessible loading status.
- Stream/suspend the listing independently of search and page chrome so a cold
  or unavailable TMDB request does not prevent someone from submitting a search.
- Subsequent loading: keep search usable, label the target mode/page and avoid
  presenting previous cards as the new results. Prevent duplicate page submissions.
- Zero query matches: No shows found with normal search recovery.
- Zero visible cards after preferences: explain that added shows are hidden;
  keep supported pagination and a link to existing preference controls.
- Listing failure: scoped Retry plus usable search/navigation; no whole-page crash.
- Add failure: existing toast feedback; do not clear the listing or submitted query.
- No artwork/synopsis/date/rating: neutral stable fallbacks, not invented metadata.
- Keyboard: native form/Enter behavior, accessible feed tabs with arrow-key
  navigation, visible focus, synopsis expansion, and fully named icon buttons.
- Tab changes retain tab focus. Search/page submissions can focus the results
  heading after completion, but must not steal focus after a newer interaction.
- Announce loading/results/empty states once using polite status updates; do not
  announce every skeleton/card or every keystroke. Mark the results region busy.
- Support 320px phones through wide desktop, 200% zoom and reduced motion. Keep
  44px touch actions, stable card geometry and bottom-navigation/toast clearance.
- No essential action or information may require hover.

## Implementation Sequence

Each phase must leave current tracking, metadata writes and guest safety intact.

| Phase | Scope | Exit condition |
| --- | --- | --- |
| 1. Listing service | TMDB feed adapter, validation, cache age policy, discover limiter/API | Contract, cache and guest-denial tests pass; search/import/refresh behavior unchanged |
| 2. State and cards | URL parser/builders, visit restoration, shared result presentation and rating fallbacks | Deterministic navigation, races, preferences and card-state tests pass |
| 3. Page integration | Discover page, guest Demo Picks, navigation icon/labels, legacy redirect and revalidation targets | Search, browse and guest flows work end to end without browse-time imports |
| 4. Verification | Full checks, real-browser responsive/accessibility QA, cache integration and staged release | Acceptance checklist below passes; no regressions in permanent or guest accounts |

Prefer the existing feature boundaries. Keep add-show/import ownership in
`features/search`; do not move metadata writers simply to rename a destination.
New discovery state/cache/page modules can live in `features/discover`, sharing
existing cards/synopsis where this removes actual duplication. Avoid a general
filter engine or a generic caching framework for three fixed feeds.

Expected integration files include `lib/tmdb/{server,types,validation,rate-limit}.ts`,
new `features/discover/*`, `app/(app)/discover/{page,loading}.tsx`,
`app/api/tmdb/discover/route.ts`, `app/(app)/search/page.tsx`,
`components/app-navigation.tsx`, `lib/constants.ts`, current search UI/session
helpers, existing `/search` link/revalidation call sites, and focused tests.
No `supabase/migrations`, metadata refresh modules, progress engine or scheduler
files belong in the implementation change set.

## Acceptance Checklist

Checked items refer to the local tests/browser fixtures and preview boundary
checks recorded below, not a claim of authenticated production validation.

- [x] Each feed maps to its allowlisted TV endpoint with its explicit requested page;
  weekly Trending page 2 never silently displays page 1.
- [x] All three feeds stop at upstream total or page 10; search retains its own
  existing bounds; guest catalogue/search has one page.
- [x] Invalid/duplicate parameters, unsupported language/feed, unauthenticated,
  expired and anonymous-global-feed requests fail before upstream/cache access.
- [x] Cache keys differ by feed/page/language/version, never by identity or secrets;
  two users share public data but not membership/preferences/guest results.
- [x] Deterministic clocks cover exact revalidate/max-age boundaries, cold failure,
  successful background refresh, failed refresh, malformed data and unusable timestamps.
- [x] A real Next.js production/staging test verifies cross-request cache reuse,
  correct revalidation and stale-age enforcement with controlled upstream fixtures.
- [x] Initial SSR data is not fetched again on hydration; selecting a tab/page loads
  only that resource. No per-keystroke, per-card or hidden multi-page request fan-out.
- [x] Search submit/clear/retry, per-feed restoration, direct links, reload and
  Back/Forward preserve the specified mode, page, query and best-effort position.
- [x] Slow old responses cannot replace a new query/feed/page; cancellation errors
  do not surface as failures or create unhandled promises.
- [x] Add success/duplicate/error/pending, hiding/fading, all-hidden pages and focus
  after hidden-card removal behave correctly, including membership beyond 1,000 rows.
- [x] Guest Demo Picks, catalogue search/add and reset/expiry work; spies prove zero
  guest TMDB calls and zero imports for any user's browsing/search/pagination.
- [x] Browsing leaves stored shows/seasons/episodes, freshness markers, user_shows,
  watched_episodes, favourites and dropped/progress state unchanged.
- [x] Track still opens Show Detail; season navigation, Specials, watched tracking,
  manual refresh and both existing cron routes retain their prior behavior.
- [x] Legacy `/search` links retain their query; navigation/empty-state links and
  revalidation target Discover without loops or duplicate active destinations.
- [x] Artwork, long titles, unknown rating/year, expandable synopsis, loading,
  no-results, all-hidden, upstream error/429 and stale states render correctly.
- [x] Real-browser keyboard, Back/Forward/scroll, 320px/mobile/desktop, zoom,
  bottom-navigation/toast clearance, reduced-motion and Design Dogmas QA pass.
- [x] Run typecheck, lint, all unit tests, fixture e2e, production build and
  `git diff --check`; review the final diff for scope and secret exposure.
- [x] Stage and verify before any separately authorized production promotion.
  Monitor aggregate discovery failures/429s/cache age without logging personal data.

`npm run test:e2e` currently executes fixture acceptance tests, not browser
automation. It does not replace the real-browser and Next.js cache checks above.

## Verification Record (2026-10-22)

| Area | Evidence |
| --- | --- |
| Contracts and isolation | `tests/discover-{tmdb,server,state,page,card,add-action,rate-limit}.test.*`; existing guest/RLS, tracking, refresh and cron regression suites |
| Large libraries | `tests/search-data.test.ts`: 1,201 memberships loaded using three read-only pages |
| Actual Next.js Data Cache | `npm run test:discover-cache`: isolated production build using the actual discovery data module, controlled upstream and aligned wall/monotonic clocks; reuse, successful/failed background revalidation, cold failure/recovery, and maximum ages pass |
| Browser interactions | Real React/Discover/AppShell components in `tests/browser/discover-fixture.mjs`, with fake actions/listings and no Auth/DB calls: search, independent pages, history, reload, slow-response cancellation, Add outcomes, hidden-card focus recovery, guest normalization and expiry |
| Visual/accessibility QA | 320px, 390px, 640px and 1600px layouts; keyboard feed arrows/Enter, title/synopsis fallbacks, dark theme, 200% desktop CSS-zoom simulation and equivalent narrowed viewport; no horizontal overflow at these supported widths; reduced-motion spinner override included |
| Live upstream contract | Actual adapter returned Trending pages 1 and 2 with 20 entries each and zero overlapping IDs; read-only, no imports |
| Local validation | Typecheck, lint, 632 tests, 9 fixture e2e tests, optimized build, production-cache integration and diff whitespace check |
| Secret review | Configured private TMDB/service-role/cron values scanned against browser build artifacts: zero matches; Vercel dry upload excludes `.env.local`, `.git`, `.next` and fixture build output |
| Preview boundary | Preview build READY; authenticated Vercel HTTP tooling confirms application 401 for the API and 307 to sign-in for the page without a Supabase session |

The obsolete Search-only page/client/session implementation was removed, while
the existing synopsis, normalization, Add action and metadata writers remain the
owners of their existing behavior. Search remains available through Discover and
the query-preserving legacy redirect. Navigation, guest exit/expiry and reset
scoping clear visit state without changing account or progress data.

Discovery uses a process-local shared 429 cooldown honoring numeric/HTTP-date
Retry-After before another discovery upstream attempt. It never sleeps/retries
automatically and does not alter scheduled-refresh request controls. Like the
existing limiter, this is not a distributed quota.

### Before Production Promotion

- Authenticated cloud QA remains outstanding. Preview currently lacks the
  CAPTCHA/demo variables present in production; do not change Auth or broaden
  Cloudflare host permissions just to bypass this. A disposable live guest test
  was requested separately and has not been run without approval.
- Repeat native-browser zoom, assistive-technology and real touch-device checks
  during human acceptance; CSS zoom and viewport simulation are not identical
  to every browser/device combination.
- Verify permanent-user discovery and guest Demo Picks on the intended deployment,
  then authorize production promotion separately. No new migration is needed.
- After promotion, monitor safe `discover_unavailable`, `discover_cache_stale`
  and `discover_cache_unavailable` events. No user IDs or search queries are logged.

### Native History Regression (2026-10-23)

The original browser fixture notified subscribers for every History API call.
It missed a real App Router integration bug: copying `history.state` into
`pushState`/`replaceState` forwards Next's internal flags, causing Next to skip
updating `useSearchParams`. URLs changed while tabs, pagination and search stayed
on the old results. The earlier fixture evidence did not establish native-router
correctness.

Discover now removes only Next-owned history flags/tree before writing, retaining
unrelated state and letting Next restore its own internals. Three regression tests
cover push, replace, unrelated-state preservation, and empty history entries.
The mocked browser fixture now models Next's internal-call guard as well.

Verified the signed-in local application: Popular, Top Rated, browse/search
pagination, search submission, Clear, Back/Forward and remembered feed pages.
No library/progress writes were performed. Also verified those interactions and
reload against a real Next.js production build using the actual Discover component
at `/discover` in `tests/integration/discover-cache-app`; only listings and the Add
action are fixtures, not routing or history. No console errors were reported.
After `npm run test:discover-cache`, this browser fixture can be served with
`node node_modules/next/dist/bin/next start tests/integration/discover-cache-app --port 3099`.
Titles identify the feed/query and page, making stale UI immediately observable.
The command's automated checks cover Data Cache behavior; the navigation checks
above were performed separately in the browser, not by `test:e2e`.

Validation after the fix: typecheck, lint, 635 tests, 9 fixture acceptance tests,
production Data Cache integration, main production build and `git diff --check`.
Authenticated cloud QA before promotion remains outstanding.

## Evidence And Remaining Risk

- [TMDB Trending TV](https://developer.themoviedb.org/reference/trending-tv) and
  [TMDB OpenAPI schema](https://developer.themoviedb.org/openapi/tmdb-api.json):
  language is documented for Trending, while paging is not. The authenticated
  read-only two-page probe above supplies live behavior evidence, not a guarantee
  that this undocumented parameter will remain supported indefinitely.
- [Popular](https://developer.themoviedb.org/reference/tv-series-popular-list) and
  [Top Rated](https://developer.themoviedb.org/reference/tv-series-top-rated-list):
  language/page parameters and provider-maintained list definitions.
- [Next.js 15 unstable_cache](https://nextjs.org/docs/15/app/api-reference/functions/unstable_cache):
  shared Data Cache, explicit keys and revalidation; request data stays outside.
  The installed Next.js 15.5.27 implementation was also checked: stale data is
  returned on background-revalidation failure, so explicit maximum-age checks matter.

Known limitations: rankings can move between page loads; hidden titles can make
a page sparse; Trending paging is verified but undocumented; restoration can
lose exact scroll on reload/expiry; cache misses can overlap across instances;
the current limiter is not a distributed quota. None requires tracking changes,
a new scheduler, database migration or additional product-design work for V1.

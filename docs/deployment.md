# Deployment

This guide covers deploying Episodic v2 from the repository root. The repository root is the Next.js app root.

## Local Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`.

Use real Supabase and TMDB values in `.env.local` before testing authenticated flows, TMDB search, library writes, or profile data controls.

## Required Environment Variables

Public browser-safe values:

- `NEXT_PUBLIC_APP_URL`: app URL for the current environment.
- `NEXT_PUBLIC_SUPABASE_URL`: Supabase project URL.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase anon key.

Server-only values:

- `SUPABASE_SERVICE_ROLE_KEY`: Supabase service-role key. Required for trusted metadata writes and account deletion.
- `TMDB_API_KEY`: TMDB v3 API key. Do not use a TMDB v4 Read Access Token.
- `CRON_SECRET`: strong random secret required in Vercel Production to authenticate automatic metadata refresh.

Do not prefix server-only secrets with `NEXT_PUBLIC_`.

## Supabase Setup

Use a clean v2 Supabase project. Legacy v1 data is not part of this deployment path.

Before deploying production traffic:

1. Create or select the clean v2 Supabase project.
2. Confirm the project URL, anon key, and service-role key.
3. Apply v2 migrations in order.
4. Configure Supabase Auth redirect URLs.
5. Add the same Supabase values to Vercel environment variables.

## Database Migration Order

Apply these SQL migrations in timestamp order:

1. `supabase/migrations/20260604000100_create_core_schema.sql`
2. `supabase/migrations/20260604000200_enable_rls_and_policies.sql`
3. `supabase/migrations/20260604000300_add_supporting_indexes.sql`

With the Supabase Dashboard SQL Editor, open each file and run it in that order.

With the Supabase CLI, run commands from the repository root and link only to the v2 project:

```bash
supabase link --project-ref <v2-project-ref>
supabase db push
```

Stop if any migration fails. Later migrations depend on objects created by earlier migrations.

After migrations are applied, regenerate app database types from the v2 project:

```bash
supabase gen types typescript --project-id <v2-project-id> --schema public > lib/supabase/types.ts
```

PowerShell users can use UTF-8 output explicitly:

```powershell
supabase gen types typescript --project-id <v2-project-id> --schema public | Set-Content -Path lib/supabase/types.ts -Encoding utf8
```

## Auth Redirect URL Setup

Configure Supabase Auth for each environment.

Local development:

- Site URL: `http://localhost:3000`
- Redirect URL: `http://localhost:3000/auth/callback`

Production:

- Site URL: `https://your-production-domain`
- Redirect URL: `https://your-production-domain/auth/callback`

Preview deployments:

- Add preview callback URLs if you need email auth flows in Vercel preview environments.
- Keep `NEXT_PUBLIC_APP_URL` aligned with the environment users are testing.

## TMDB API Key Setup

Create or use a TMDB developer account and copy the TMDB v3 API key.

Set:

```env
TMDB_API_KEY=your-tmdb-v3-api-key
```

The app calls TMDB only from server route handlers and server actions. Browser components call app-owned API routes instead of TMDB directly.

## Vercel Deployment Setup

When deploying this repository to Vercel, use:

- Framework preset: Next.js
- Root Directory: leave as the default repository root
- Install Command: `npm install`
- Build Command: `npm run build`
- Output Directory: leave as the Next.js default

Add these Vercel environment variables for production and any preview environments that should be functional:

- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `TMDB_API_KEY`

Use the production app URL for production `NEXT_PUBLIC_APP_URL`. For preview deployments, either set the preview URL explicitly when testing auth flows or add matching Supabase redirect URLs.

## Automatic Metadata Refresh

The root `vercel.json` schedules `GET /api/cron/refresh-metadata` daily at **05:00 UTC**, using `0 5 * * *`. Vercel invokes the production deployment; this does not schedule preview or local runs. See [Vercel Cron overview](https://vercel.com/docs/cron-jobs).

The guest-cleanup cron runs separately at 06:00 UTC. On Hobby, the metadata invocation may occur anywhere from 05:00:00 through 05:59:59 UTC; it is not guaranteed to start at exactly 05:00. See [Vercel scheduling limits](https://vercel.com/docs/cron-jobs/usage-and-pricing).

### Eligibility And Batch

- Select distinct shows present in at least one non-dropped permanent user's library; guest-only demand is excluded. Favourite and watched progress do not affect eligibility.
- Select both `id` and `show_tmdb_id` from the eligibility RPC before ordering by `id`. PostgREST's RPC record projection otherwise fails with `42703: column record.id does not exist`, preventing the whole batch from starting. The selector paginates this RPC and metadata/date reads, including when the server returns fewer rows than requested.
- A show is airing when a stored **main-season** episode has an air date in the inclusive UTC window from 14 days ago through seven days ahead. This also covers recently ended finales so late-added details can be collected. Specials, null dates and dates outside that window do not create daily eligibility.
- Airing shows become due at midnight UTC on the day after their last successful refresh. Using calendar days prevents a daily invocation arriving earlier than yesterday's invocation from skipping a day. A successful manual refresh today also satisfies today's freshness requirement. Outside the airing window, active/unknown shows are stale at 5 days and Ended/Canceled/Cancelled at 180 days. Lifecycle matching ignores case and surrounding whitespace; exact thresholds count as stale.
- Null `last_synced_at` is immediately stale and first within its queue unless a retry window applies. Each queue orders by its oldest due time, then prioritizes aired episodes missing a real title, synopsis or runtime when due times tie, then ascending TMDB ID. Future placeholder details alone do not break ties ahead of already aired episodes. Older overdue work therefore remains ahead of repeatedly incomplete upstream data.
- Interleave four airing candidates with one background candidate. With both queues full, a batch of 25 includes 20 airing and five background shows; either queue uses spare capacity. Interleaving also starts background work before the end of the invocation, rather than leaving it behind the whole airing backlog. Watching, caught-up and watchlist demand all benefit without changing tracked progress.
- Scheduled attempts persist `shows.metadata.scheduledRefreshRetry` before fetching metadata. Its `failureCount` and `retryAt` defer unsuccessful or interrupted attempts for 2, 4, 8, 16, then at most 30 days. This prevents permanently failing shows from taking every daily slot. Retries become eligible at the later of their normal due time and `retryAt`, and rank by that later time. Unattempted candidates do not receive backoff.
- Successful scheduled, manual, or full imports finalize show metadata and freshness only after all season/episode writes succeed, clearing retry state at that final step. Full imports first ensure the show parent exists with an insert that ignores existing rows; incomplete new imports keep null freshness, and failed manual imports preserve existing freshness and retry state. Reserving a scheduled attempt preserves other metadata and never advances `last_synced_at`; it compares the selected metadata and freshness before writing so a concurrent update cannot be overwritten. A failed reservation is reported as a per-show failure and does not start a refresh. No schema migration is required.
- Each invocation selects at most 25 candidates (both the default and hard cap) and refreshes them sequentially within the existing time budget. This increases daily capacity without increasing the cron frequency or exceeding the Hobby daily scheduling limit.

Policy and pagination live in `features/shows/metadata-refresh-candidates.ts`; scheduled execution uses `features/shows/scheduled-metadata-refresh.ts` and its plan in `features/shows/metadata-refresh-plan.ts`. These thresholds determine eligibility, not a guarantee that every eligible show is refreshed that day.

### Selective Scheduled Refresh

- Always fetch general TV details and update all returned season summaries. Read stored summary counts and the complete paginated episode catalogue before writing.
- For active/unknown shows, fetch details for last-aired/next-airing main seasons and the preceding main season (fallback: highest two main seasons). Also fetch new/count-changed/incomplete seasons, main seasons with unresolved or future dates, and any season whose successful detail sync is missing, pending, or at least 180 days old.
- Specials participate in new/count-changed/incomplete/periodic detail refresh, not main-series scheduling signals. Newly fetched Ended/Canceled/Cancelled lifecycle triggers a full detail refresh, including Specials.
- `seasons.last_synced_at` describes summary sync. Season JSON `episodesLastSyncedAt` describes successful episode-detail sync. Skipped episodes retain their timestamps and fields. `episodesRefreshPending` survives an interrupted write so overwritten summary counts cannot hide unfinished details.
- Existing seasons without a detail marker get a conservative detail fetch. Full initial imports and manual refresh still fetch all season details and replace season JSON, so the following scheduled refresh may need to establish detail markers again.
- After reserving the attempt, fetch and validate selected responses before catalogue writes. Reject changed season/episode TMDB identities or renumbering rather than reassigning watched coordinates. Upsert summaries, selected episodes, successful detail markers, then show freshness last. Never delete missing rows or write tracking tables.
- Season requests are batched at five concurrent requests; a failed batch drains its siblings before failing the show. Shared invocation controls pace starts at 100ms apart, use 15-second request timeouts, and honor a shared 429 Retry-After cooldown with one retry per request. Database operations have up to 10 seconds each. No raw errors, user data, credentials, or request URLs are logged.
- The route declares `maxDuration = 300`, with an internal 240-second deadline measured from invocation start and 20-second headroom before starting work. The same controller bounds eligibility scans, every metadata/date page, retry reservations, and refresh execution. Selection checks the deadline between pages, and each database request has an abort signal with at most 10 seconds remaining. Selection failure or timeout returns a safe 500 before any reservations or refreshes start, including dry runs. Candidates lacking time to reserve an attempt remain eligible; reserved but interrupted attempts retain backoff. A selected batch of 25 is a work budget, not a guarantee that all 25 finish. Confirm the deployed Vercel project supports this duration. Sequential show execution and the daily schedule are unchanged.
- Logs include season-selection reasons, request/retry totals, per-show timing/failure stage, and batch summary. Compare a long-running show's steady-state detail count against its total seasons before considering higher capacity.

### Security And Configuration

Before deploying, add `CRON_SECRET` to the Vercel project's **Production** environment variables with a strong random value generated by a password manager. Vercel recommends at least 16 random characters and automatically sends the value as `Authorization: Bearer <CRON_SECRET>`. The route checks the exact Bearer token. See [Vercel cron security](https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs).

Only the variable name and blank entry belong in `.env.example`. Never commit the value, put it in `vercel.json`, prefix it with `NEXT_PUBLIC_`, include it in URLs, or log request headers. Configure the value through Vercel's environment settings; `.env.local` is not changed by this setup. Changing Production environment variables requires a new deployment to take effect.

The existing Production `SUPABASE_SERVICE_ROLE_KEY`, Supabase URL, and `TMDB_API_KEY` must also be valid. No Episodic user session is required: the exact cron path bypasses session middleware and authenticates inside the route. Do not add an unprotected alternate endpoint or weaken token validation.

Invalid authorization returns 401. Missing cron secret or metadata-client configuration returns 503. A real refresh also requires a configured `TMDB_API_KEY`; a missing/placeholder key returns 503 before database access or retry reservations, so fixing the configuration does not leave shows deferred. If TMDB rejects credentials during execution (`TMDB_AUTH_ERROR` or `TMDB_NOT_CONFIGURED`), the route releases the current reservation and stops the batch with a safe 503. The release compares the reserved metadata and original freshness so it cannot undo a concurrent update. Earlier completed shows remain committed; later candidates are untouched. A failed release is logged without raw errors and still stops the batch; inspect the affected show's retry state after restoring database access.

Candidate-selection failure returns a safe 500 before any refresh starts. Ordinary per-show failures retain their retry state and processing continues; a 200 response can therefore contain `failed > 0`.

### Authenticated Dry Run

Use a private HTTP client to send this request to the production domain, substituting the secret only in its protected Authorization header field:

```http
GET /api/cron/refresh-metadata?dryRun=1
Authorization: Bearer <CRON_SECRET>
```

The dry run requires the same authentication, selects candidates, and returns only candidate TMDB IDs with `ok`, `dryRun`, and `considered`. It performs no TMDB metadata refresh or metadata writes, and remains available without a TMDB key to diagnose database eligibility. Only `dryRun=1` is supported; other supplied values return 400. All responses use `Cache-Control: no-store`.

### Production QA Sequence

1. Configure the strong random `CRON_SECRET` in Vercel Production and confirm the existing Supabase and TMDB server credentials are configured.
2. Deploy the application, including `vercel.json` and the Phase 1-3 route/services. Scheduling becomes active on production deployment, so allow time for QA outside the scheduled hour.
3. Send the authenticated dry-run request above. Expect HTTP 200, `ok: true`, `dryRun: true`, and at most 25 candidate IDs. Also confirm a request without authorization returns 401.
4. Verify those IDs against non-dropped library membership, main-episode air dates, lifecycle, retry state and last-sync timestamps using trusted database access. Check the airing/background interleave and that a show refreshed earlier on the current UTC day is excluded. Confirm that the dry run changed no data. An empty set is valid if nothing is eligible and stale.
5. Record a private before-state for the selected shows' metadata and their associated `user_shows` and `watched_episodes`. Invoke `GET /api/cron/refresh-metadata` once with the same Authorization header and no `dryRun` parameter. This request performs real shared metadata writes; avoid overlapping another invocation.
6. Inspect the HTTP summary: `considered`, `refreshed`, `failed`, and per-ID `results`. Review Vercel logs under `[metadata-refresh-cron]`; investigate failures even when HTTP status is 200.
7. For successful IDs, verify `shows.last_synced_at` advanced and any available title/date/runtime corrections or new seasons/episodes appeared. Confirm old stored rows were retained, `user_shows` (including favourite and dropped status) and `watched_episodes` match the before-state, and new episodes were not marked watched. Keep user data and credentials out of shared QA logs. Reload affected app pages to inspect changes.
8. In Vercel Project Settings > Cron Jobs, confirm there is exactly one entry for `/api/cron/refresh-metadata` with `0 5 * * *`. After the next scheduled window, inspect View Logs and confirm an actual scheduled invocation completed with the expected summary. A manual request alone does not verify scheduling.

If there were no stale candidates, the real endpoint should return zero counts. Metadata-mutation QA remains unverified until a nonempty batch succeeds; do not alter production progress or timestamps just to force candidates.

### Operational Limitations

- Metadata upserts are not transactional across requests. Both scheduled and manual/full refresh finalize show freshness and clear retry state last, but earlier successful season/episode writes are not rolled back. Scheduled refresh also leaves unfinished detail writes pending. Failed full imports of existing shows preserve their previous show metadata/freshness/retry state; failed first imports may leave a parent with null freshness and partial children.
- Guarded reservations stop concurrent scheduled requests from starting work from the same snapshot. There is no lock spanning manual and scheduled writes, so overlapping manual/cron requests may still duplicate work.
- First-pass/detail-marker recovery and inactive full refreshes can still fetch many seasons. Deadline and request controls bound work but do not guarantee a large show completes; inspect repeated failures and runtime metrics.
- Vercel does not automatically retry failed invocations, and delivery may be missed or duplicated. Monitor results and logs. See [Vercel cron operations](https://vercel.com/docs/cron-jobs/manage-cron-jobs).
- The 25-show cap, API/database latency and execution deadline may still leave a backlog. Successful shows leave the due queue, unattempted shows remain due, and failed/interrupted attempts retain backoff. The next daily invocation can continue remaining work. Existing cached dates drive daily classification; an unknown/unannounced release is discovered by the normal five-day active-show refresh before it can enter the daily queue.
- Already-open browser pages do not update automatically. App pages read Supabase dynamically on subsequent server renders; there is no polling or cron-driven browser refresh.

## Test And Build Commands

Run these before deploying:

```bash
npm run lint
npm run typecheck
npm run test
npm run test:e2e
npm run build
```

Production dependency audit:

```bash
npm audit --omit=dev
```

The production audit currently has a documented moderate Next.js bundled PostCSS finding. See `docs/dependency-audit.md`.

## Guest Demo Rollout

Guest demo is disabled by default. Follow [Guest Demo](guest-demo.md) for the
required migration-first deployment, cached-catalogue bootstrap, auth-wide
Turnstile configuration, staging QA and enablement order. The new guest cleanup
cron runs daily at 06:00 UTC; the existing metadata refresh schedule is unchanged.

## Security Notes

- Keep `SUPABASE_SERVICE_ROLE_KEY` server-only.
- Keep `TMDB_API_KEY` server-only.
- Never add service-role or TMDB secrets to `NEXT_PUBLIC_*` variables.
- Supabase RLS policies must be applied before real users use the app.
- User-owned tables are protected by RLS and feature-level ownership filters.
- Shared TMDB metadata is readable by authenticated users, while trusted server code writes metadata with the service-role client.
- Destructive actions validate confirmation on the server as well as in the UI.
- TMDB route handlers validate query bounds, TMDB ids, language values, and use in-memory rate limiting.

## Known Limitations

- These migrations assume a fresh v2 Supabase database. v1 data migration is not included.
- TMDB rate limiting is in-memory and resets on process restart. Use persistent distributed rate limiting or platform/WAF controls for scaled production.
- E2E tests currently use fixture-based acceptance coverage rather than a live browser, Supabase, and TMDB environment.
- Supabase TypeScript types are manually checked until regenerated from the applied v2 schema.
- The production dependency audit currently reports the accepted Next.js bundled PostCSS advisory.

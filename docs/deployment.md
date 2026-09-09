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

This is the only configured schedule. On Hobby, the invocation may occur anywhere from 05:00:00 through 05:59:59 UTC; it is not guaranteed to start at exactly 05:00. See [Vercel scheduling limits](https://vercel.com/docs/cron-jobs/usage-and-pricing).

### Eligibility And Batch

- Select distinct shows present in at least one non-dropped library. Favourite and watched progress do not affect eligibility.
- Null `last_synced_at` is immediately stale and has highest priority.
- Active or unknown lifecycle is stale at 24 hours; Ended/Canceled/Cancelled is stale at 30 days. Exact thresholds count as stale; matching ignores case and surrounding whitespace.
- After null timestamps, prioritize active lifecycle, then oldest sync time, then ascending TMDB ID.
- Each invocation selects at most the default 5 candidates and refreshes them sequentially. The selector's hard cap remains 10, but the route does not override its default.

Policy and pagination live in `features/shows/metadata-refresh-candidates.ts`; refresh execution uses `features/shows/metadata-refresh.ts`. These thresholds determine eligibility, not a guarantee that every eligible show is refreshed that day.

### Security And Configuration

Before deploying, add `CRON_SECRET` to the Vercel project's **Production** environment variables with a strong random value generated by a password manager. Vercel recommends at least 16 random characters and automatically sends the value as `Authorization: Bearer <CRON_SECRET>`. The route checks the exact Bearer token. See [Vercel cron security](https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs).

Only the variable name and blank entry belong in `.env.example`. Never commit the value, put it in `vercel.json`, prefix it with `NEXT_PUBLIC_`, include it in URLs, or log request headers. Configure the value through Vercel's environment settings; `.env.local` is not changed by this setup. Changing Production environment variables requires a new deployment to take effect.

The existing Production `SUPABASE_SERVICE_ROLE_KEY`, Supabase URL, and `TMDB_API_KEY` must also be valid. No Episodic user session is required: the exact cron path bypasses session middleware and authenticates inside the route. Do not add an unprotected alternate endpoint or weaken token validation.

Invalid authorization returns 401. Missing cron secret or metadata-client configuration returns 503. Candidate-selection failure returns a safe 500 before any refresh starts. Per-show failures are recorded and processing continues; a 200 response can therefore contain `failed > 0`.

### Authenticated Dry Run

Use a private HTTP client to send this request to the production domain, substituting the secret only in its protected Authorization header field:

```http
GET /api/cron/refresh-metadata?dryRun=1
Authorization: Bearer <CRON_SECRET>
```

The dry run requires the same authentication, selects candidates, and returns only candidate TMDB IDs with `ok`, `dryRun`, and `considered`. It performs no TMDB metadata refresh or metadata writes. Only `dryRun=1` is supported; other supplied values return 400. All responses use `Cache-Control: no-store`.

### Production QA Sequence

1. Configure the strong random `CRON_SECRET` in Vercel Production and confirm the existing Supabase and TMDB server credentials are configured.
2. Deploy the application, including `vercel.json` and the Phase 1-3 route/services. Scheduling becomes active on production deployment, so allow time for QA outside the scheduled hour.
3. Send the authenticated dry-run request above. Expect HTTP 200, `ok: true`, `dryRun: true`, and at most 5 candidate IDs. Also confirm a request without authorization returns 401.
4. Verify those IDs against non-dropped library membership, lifecycle, and last-sync timestamps using trusted database access. Confirm that the dry run changed no data. An empty set is valid if nothing is eligible and stale.
5. Record a private before-state for the selected shows' metadata and their associated `user_shows` and `watched_episodes`. Invoke `GET /api/cron/refresh-metadata` once with the same Authorization header and no `dryRun` parameter. This request performs real shared metadata writes; avoid overlapping another invocation.
6. Inspect the HTTP summary: `considered`, `refreshed`, `failed`, and per-ID `results`. Review Vercel logs under `[metadata-refresh-cron]`; investigate failures even when HTTP status is 200.
7. For successful IDs, verify `shows.last_synced_at` advanced and any available title/date/runtime corrections or new seasons/episodes appeared. Confirm old stored rows were retained, `user_shows` (including favourite and dropped status) and `watched_episodes` match the before-state, and new episodes were not marked watched. Keep user data and credentials out of shared QA logs. Reload affected app pages to inspect changes.
8. In Vercel Project Settings > Cron Jobs, confirm there is exactly one entry for `/api/cron/refresh-metadata` with `0 5 * * *`. After the next scheduled window, inspect View Logs and confirm an actual scheduled invocation completed with the expected summary. A manual request alone does not verify scheduling.

If there were no stale candidates, the real endpoint should return zero counts. Metadata-mutation QA remains unverified until a nonempty batch succeeds; do not alter production progress or timestamps just to force candidates.

### Operational Limitations

- Metadata upserts are not transactional. `shows.last_synced_at` may look fresh after a later season/episode write fails.
- Invocations are not locked; overlapping manual/cron requests may duplicate work.
- Large shows fetch many seasons and may reach function runtime limits. The small batch limits load but does not guarantee completion within the deployed runtime budget.
- Vercel does not automatically retry failed invocations, and delivery may be missed or duplicated. Monitor results and logs. See [Vercel cron operations](https://vercel.com/docs/cron-jobs/manage-cron-jobs).
- Five shows per day may leave a stale backlog. This initial schedule intentionally favors low resource use.
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

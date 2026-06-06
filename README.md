# Episodic v2

Episodic v2 is the Next.js rebuild of the personal TV show tracking app.

The legacy vanilla HTML/CSS/JavaScript app remains at the repository root as functional reference only. Do not migrate legacy JavaScript into this app.

## Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- Supabase Auth and Postgres
- shadcn/ui-style component organization
- TMDB API through server-side route handlers

## Implemented Features

- Supabase authentication: sign up, sign in, sign out, password recovery, reset password, and session restore.
- Protected app area with dashboard, search, library, progress, show detail, and profile pages.
- TMDB TV search and full show detail loading through server-side API routes.
- Add shows to a user-owned library, including shared show, season, and episode metadata.
- Remove shows from the library and prevent duplicate additions.
- Library filtering and sorting by status, favourites, title, date added, and progress.
- Derived show status display: `watchlist`, `watching`, `caught_up`, `completed`, and `dropped`.
- Manual Drop and Resume controls for the dropped override.
- Favourite and unfavourite controls.
- Episode watched/unwatched tracking.
- Season watched/unwatched actions.
- Whole-show watched and progress reset actions.
- Dashboard summary, progress dashboard, and Continue Watching.
- User preferences for hiding/fading dropped, completed, and already-added shows.
- User data export, clear watched history, reset library data, and delete account controls.
- TMDB attribution on TMDB-powered views.

## Local Setup

```bash
cd v2
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Local Supabase and TMDB calls require real values in `.env.local`; placeholder values are only useful for rendering non-integrated states.

## Environment Variables

Use `.env.local` for local development and the deployment provider environment settings for production.

Public browser-safe values:

- `NEXT_PUBLIC_APP_URL`: local or deployed app URL, such as `http://localhost:3000` or `https://your-domain.example`.
- `NEXT_PUBLIC_SUPABASE_URL`: Supabase project URL.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase anon key. This is browser-safe only with Row Level Security configured.

Server-only values:

- `SUPABASE_SERVICE_ROLE_KEY`: Supabase service-role key for trusted server-side metadata writes and account deletion. Never expose through `NEXT_PUBLIC_*`.
- `TMDB_API_KEY`: TMDB v3 API key. The app sends this as the server-side `api_key` query parameter. Do not use a TMDB v4 Read Access Token here.

## Supabase Setup

Episodic v2 expects a clean v2 Supabase project. Do not apply these migrations to the legacy v1 Supabase project.

Apply migrations in order:

1. `supabase/migrations/20260604000100_create_core_schema.sql`
2. `supabase/migrations/20260604000200_enable_rls_and_policies.sql`
3. `supabase/migrations/20260604000300_add_supporting_indexes.sql`

The migrations create the schema, helper functions, triggers, Row Level Security policies, and supporting indexes.

After applying migrations, regenerate Supabase TypeScript types from the v2 project:

```bash
supabase gen types typescript --project-id <v2-project-id> --schema public > lib/supabase/types.ts
```

See [database/README.md](database/README.md) and [supabase/README.md](supabase/README.md) for more detail.

## Auth Redirect URLs

For local development, configure Supabase Auth with:

- Site URL: `http://localhost:3000`
- Redirect URL: `http://localhost:3000/auth/callback`

For production, configure:

- Site URL: `https://your-production-domain`
- Redirect URL: `https://your-production-domain/auth/callback`

`NEXT_PUBLIC_APP_URL` should match the active environment URL because auth actions use it for email redirects.

## Useful Commands

```bash
npm run dev
npm run lint
npm run typecheck
npm run test
npm run test:e2e
npm run build
```

## Tracking Status Model

Episodic v2 derives user-facing tracking status from watched episode progress and show metadata. `watched_episodes` is the source of truth for progress, while `user_shows.status` is retained as a compatibility field where only `dropped` acts as a manual override.

See [docs/tracking-status-model.md](docs/tracking-status-model.md) for the full model, including `caught_up` and `completed` display statuses.

## Deployment

See [docs/deployment.md](docs/deployment.md) for Vercel setup, environment variables, migration order, security notes, and known limitations.

For Vercel deployments from the repository root, set the Vercel root directory to `v2`.

## Security Notes

- Supabase access is split between browser-safe, server, middleware, and admin clients under `lib/supabase/`.
- Browser code uses only `NEXT_PUBLIC_*` Supabase values.
- The service-role key is read only by server-only modules and must never be exposed to the browser.
- TMDB keys are server-only and used only through app API routes or server actions.
- User-owned data relies on Supabase Row Level Security policies.
- Destructive profile actions require client confirmation and server-side confirmation validation.
- TMDB route handlers validate inputs and use in-memory rate limits.

## Known Limitations

- v1 data migration is out of scope for the initial v2 launch.
- TMDB rate limiting is in-memory and should be replaced or supplemented with persistent distributed rate limiting for scaled production deployments.
- Current e2e acceptance tests use fixture-based flows rather than a browser-backed live Supabase stack.
- `npm audit --omit=dev` currently reports a documented moderate advisory through Next.js bundled PostCSS. See [docs/dependency-audit.md](docs/dependency-audit.md).

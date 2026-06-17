# Episodic

Episodic is a focused TV tracking app for people who want to know exactly what to watch next.

Build a personal library from TMDB, follow episode-by-episode progress, keep favourites close, and let the dashboard surface the shows that need attention. Episodic is designed around the everyday viewing loop: add a show, track what you have watched, pick up from the next episode, and keep the rest of the library clean.

## What It Does

### A Dashboard For Your Next Episode

Episodic opens on a practical command center for your library. It highlights in-progress shows, shows the next unwatched episode, surfaces upcoming episodes from saved metadata, and gives quick totals across watchlist, watching, caught up, completed, dropped, and favourite shows.

### Search, Save, And Organize

Search TMDB directly from the app, review poster art and show summaries, and add shows to your private library. Once saved, shows can be browsed in grid or list view, filtered by tracking status, sorted by title, date added, or progress, and marked as favourites.

### Episode-Level Progress

Every show has a dedicated tracking page with season navigation, episode rows, air dates, runtimes, overviews, and progress bars. Mark a single episode, an entire season, or the whole show as watched. Reset progress, refresh TMDB metadata, drop a show without losing history, and resume it when you are ready.

### Preferences That Keep The Library Quiet

Episodic includes display preferences for hiding or fading dropped, completed, and already-added shows. The result is a library that can stay comprehensive without becoming noisy.

### Account And Data Control

Each account owns its own library and watch history. Profile tools include library statistics, preference management, JSON export, watched-history cleanup, full library reset, and account deletion with confirmation safeguards.

## Product Highlights

- Private TV library backed by Supabase Auth and Row Level Security.
- TMDB-powered show search, metadata, posters, seasons, and episodes.
- Continue Watching flow based on the next unwatched episode.
- Watchlist, watching, caught up, completed, dropped, and favourite states.
- Episode, season, and whole-show watched controls.
- Grid and list library views with filters, sorting, progress, and quick actions.
- Upcoming episode and Start Watching dashboard sections.
- User preferences for a cleaner tracking experience.
- User-owned export and destructive data controls.

## Tech Stack

- Next.js App Router
- React 19
- TypeScript
- Tailwind CSS
- Supabase Auth and Postgres
- TMDB API through server-side route handlers and server actions
- Vitest test coverage for data, validation, view models, and acceptance flows

## Run Locally

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Authenticated flows, TMDB search, library writes, and profile data controls require real Supabase and TMDB values in `.env.local`. Placeholder values are only useful for rendering non-integrated states.

## Environment Variables

Use `.env.local` for local development and your deployment provider's environment settings for production.

Public browser-safe values:

- `NEXT_PUBLIC_APP_URL`: local or deployed app URL, such as `http://localhost:3000`.
- `NEXT_PUBLIC_SUPABASE_URL`: Supabase project URL.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase anon key. This is browser-safe only with Row Level Security configured.

Server-only values:

- `SUPABASE_SERVICE_ROLE_KEY`: Supabase service-role key for trusted metadata writes and account deletion. Never expose this through `NEXT_PUBLIC_*`.
- `TMDB_API_KEY`: TMDB v3 API key. The app sends this from server-side code only.

## Supabase Setup

Episodic expects a clean v2 Supabase project. Do not apply these migrations to a legacy v1 Supabase project.

Apply migrations in order:

1. `supabase/migrations/20260604000100_create_core_schema.sql`
2. `supabase/migrations/20260604000200_enable_rls_and_policies.sql`
3. `supabase/migrations/20260604000300_add_supporting_indexes.sql`

After applying migrations, regenerate Supabase TypeScript types from the v2 project:

```bash
supabase gen types typescript --project-id <v2-project-id> --schema public > lib/supabase/types.ts
```

See [database/README.md](database/README.md), [supabase/README.md](supabase/README.md), and [docs/deployment.md](docs/deployment.md) for the full database and deployment path.

## Auth Redirect URLs

For local development, configure Supabase Auth with:

- Site URL: `http://localhost:3000`
- Redirect URL: `http://localhost:3000/auth/callback`

For production, configure:

- Site URL: `https://your-production-domain`
- Redirect URL: `https://your-production-domain/auth/callback`

`NEXT_PUBLIC_APP_URL` should match the active environment URL because auth actions use it for email redirects.

## Quality Checks

```bash
npm run lint
npm run typecheck
npm run test
npm run test:e2e
npm run build
```

## Security Notes

- Browser code uses only `NEXT_PUBLIC_*` Supabase values.
- Service-role and TMDB keys are read only by server-side modules.
- User-owned data relies on Supabase Row Level Security policies.
- Destructive profile actions require client confirmation and server-side validation.
- TMDB route handlers validate inputs and use in-memory rate limits.

## Current Scope

- v1 data migration is out of scope for the v2 app.
- TMDB rate limiting is in-memory and should be replaced or supplemented with persistent distributed rate limiting for scaled production deployments.
- E2E acceptance tests use fixture-based flows rather than a browser-backed live Supabase stack.
- `npm audit --omit=dev` currently reports a documented moderate advisory through Next.js bundled PostCSS. See [docs/dependency-audit.md](docs/dependency-audit.md).

## Attribution

Show data and imagery are powered by TMDB. Episodic uses TMDB data through server-side routes and includes TMDB attribution on TMDB-powered views.

# Deployment

This guide covers deploying Episodic v2 from the `v2/` app directory.

## Local Setup

```bash
cd v2
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

Do not prefix server-only secrets with `NEXT_PUBLIC_`.

## Supabase Setup

Use a clean v2 Supabase project. The root legacy Supabase project and v1 data are not part of this deployment path.

Before deploying production traffic:

1. Create or select the clean v2 Supabase project.
2. Confirm the project URL, anon key, and service-role key.
3. Apply v2 migrations in order.
4. Configure Supabase Auth redirect URLs.
5. Add the same Supabase values to Vercel environment variables.

## Database Migration Order

Apply these SQL migrations in timestamp order:

1. `v2/supabase/migrations/20260604000100_create_core_schema.sql`
2. `v2/supabase/migrations/20260604000200_enable_rls_and_policies.sql`
3. `v2/supabase/migrations/20260604000300_add_supporting_indexes.sql`

With the Supabase Dashboard SQL Editor, open each file and run it in that order.

With the Supabase CLI, run commands from `v2/` and link only to the v2 project:

```bash
cd v2
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

When deploying from the monorepo/root repository, set:

- Framework preset: Next.js
- Root Directory: `v2`
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

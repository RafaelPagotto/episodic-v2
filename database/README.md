# Episodic v2 Database

Episodic v2 uses a new clean Supabase project/database. The legacy v1 Supabase project remains a fallback and must not be modified by these migrations.

## Source Of Truth

The migration files under `supabase/migrations/` are the database source of truth for launch.

The SQL files in this folder are reviewed reference snapshots:

- `schema.sql`: tables, enum types, helper functions, triggers, comments, and the auth-user bootstrap trigger.
- `policies.sql`: Row Level Security policies for user-owned rows and shared TMDB metadata.
- `indexes.sql`: supporting indexes for common library, progress, and metadata queries.

Do not copy these reference snapshots over the migration files unless intentionally creating a reviewed migration.

## Fresh Project Warning

These migrations assume an empty v2 Supabase database with no manually created application tables. They do not migrate v1 data and they do not expect any v1 tables to exist.

Do not run them against the v1 Supabase project or any database that already contains an incompatible `profiles`, `shows`, `user_shows`, or `watched_episodes` schema.

## Migration Order

Apply the v2 migrations in this exact order:

1. `supabase/migrations/20260604000100_create_core_schema.sql`
2. `supabase/migrations/20260604000200_enable_rls_and_policies.sql`
3. `supabase/migrations/20260604000300_add_supporting_indexes.sql`

The first migration creates schema objects, helper functions, and triggers. The second enables RLS and adds access policies. The third adds performance indexes.

## Type Generation

`lib/supabase/types.ts` should be regenerated from the v2 Supabase schema after migrations are applied:

```bash
supabase gen types typescript --project-id <v2-project-id> --schema public > lib/supabase/types.ts
```

Use only the new v2 Supabase project id, never the legacy v1 project.

## Applying With Supabase Dashboard

In the new v2 Supabase project SQL Editor, open each migration file and run it in the order above.

Stop if any migration fails. Do not skip ahead, because later migrations depend on earlier tables and helper objects.

## Applying With Supabase CLI

Use a v2-specific Supabase CLI setup from the repository root. The `supabase/` directory is already committed for v2 migrations.

Example flow after installing and authenticating the Supabase CLI:

```bash
supabase link --project-ref <v2-project-ref>
supabase db push
```

If your local Supabase CLI requires a `supabase/config.toml`, run `supabase init` from the repository root and review the generated config before linking. Keep any generated `supabase/config.toml` scoped to the v2 project.

## Security Model

- `profiles`, `user_preferences`, `user_shows`, and `watched_episodes` are user-owned.
- RLS allows authenticated users to read and write only their own user-owned rows.
- `shows`, `seasons`, and `episodes` contain shared TMDB metadata.
- Authenticated users can read shared TMDB metadata.
- Client-side writes to shared metadata are intentionally not allowed by RLS policies.
- Trusted server code may upsert TMDB metadata with the service-role key, but that key must never be exposed to browser code.

## Data Model Notes

- `user_shows.status` stores `watchlist`, `watching`, `watched`, or `dropped`.
- `watched_episodes` stores episode-level progress and supports season/show bulk actions through filtered inserts and deletes.
- `episodes.episode_key` and `watched_episodes.episode_key` are generated labels such as `S1E3` for display and export.
- Removing a show from a user's library cascades that user's watched progress through the `watched_episodes_library_fk` constraint.

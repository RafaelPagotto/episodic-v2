# Episodic v2 Supabase

This directory is for the clean v2 Supabase project only.

Do not mix these migrations with the repository-root `supabase/` directory, which belongs to legacy project history.

If you use the Supabase CLI from `v2/`, keep CLI-generated temp files and local environment files out of git.

## Migration Order

Apply migrations in timestamp order:

1. `migrations/20260604000100_create_core_schema.sql`
2. `migrations/20260604000200_enable_rls_and_policies.sql`
3. `migrations/20260604000300_add_supporting_indexes.sql`

These migrations assume a fresh v2 database. They do not migrate data from v1.

## What Is Included

- Core schema, enums, helper functions, and triggers
- Row Level Security enablement and policies
- Supporting indexes

## What Is Not Included

- v1 data migration
- Legacy table compatibility
- Manual application to the live database

Apply these migrations only to the new v2 Supabase project after reviewing the SQL.

For Supabase CLI usage, run commands from `v2/`, not from the repository root. Link the CLI only to the v2 Supabase project.

## Regenerating TypeScript Types

After these migrations are applied to the v2 Supabase project, regenerate the app database types from the live v2 schema.

From the repository root:

```bash
supabase gen types typescript --project-id <v2-project-id> --schema public > v2/lib/supabase/types.ts
```

From inside `v2/`:

```bash
supabase gen types typescript --project-id <v2-project-id> --schema public > lib/supabase/types.ts
```

Windows PowerShell users should prefer `Set-Content` with UTF-8 output:

```powershell
supabase gen types typescript --project-id <v2-project-id> --schema public | Set-Content -Path lib/supabase/types.ts -Encoding utf8
```

Use the v2 project id only. Do not generate these types from the legacy v1 Supabase project.

# Guest Demo

Each visitor gets a separate Supabase anonymous account. The lifetime is exactly
72 hours from Auth account creation; browser closure, resuming, and reset do not
extend it. RLS denies expired or uninitialized guests even with a retained JWT.
Demo entry is disabled unless `DEMO_ENABLED=true` and a Turnstile site key exists.
The flag gates entry, not existing sessions or daily cleanup.

## Data And Permissions

- `guest_sessions` is registered by an Auth insert trigger, including direct Auth
  API signups. It contains server-owned expiration and initialization timestamps.
  Guests can read only their own registration; client writes are denied.
- `demo_catalogue` contains the six curated TMDB IDs. Clients can read, not edit it.
  Restrictive RLS applies expiry and catalogue checks alongside existing ownership
  rules. It does not trust user-editable metadata or change permanent-user access.
- Service-role-only RPCs seed/reset one currently anonymous account atomically,
  select permanent-user metadata demand, or clean up expired anonymous accounts.
  Privileged implementations live in the unexposed `private` schema with fixed
  search paths and explicit grants. Public wrappers are security invoker functions.
- The seed uses existing date-only, saved-timezone and progress helpers. Specials
  and future main episodes are not automatically watched. Unknown-date eligibility
  follows the existing progress engine. Guests can manually track Specials.
- Guest search/add use stored metadata only. Live details and manual metadata
  refresh are rejected server-side. Guest-only memberships never create automatic
  refresh demand; a permanent user's non-dropped membership still does.
- Reset restores sample library/progress/favourites/dropped state and default
  preferences, preserving timezone and expiry. Requires `RESET DEMO`; database
  serialization and a ten-second cooldown bound repeated resets. No conversion UI
  or progress transfer is provided. Exit signs out locally; accounts remain until
  cleanup. Existing guest export/clear/delete controls remain ownership-protected.
- A failed saved-timezone read aborts initialization. The transaction locks the
  profile and checks the read snapshot before seeding, so concurrent timezone
  changes cause a safe retry rather than progress based on a fallback date.

## Rollout Order

1. Keep anonymous sign-ins disabled and `DEMO_ENABLED=false`. Apply
   `supabase/migrations/20261007140947_isolated_guest_demo.sql` to staging first,
   then production after reviewing tests/advisors. Apply before deploying the new
   candidate-selector code: its service-only RPC is required even with demo off.
2. Confirm the bootstrap targets the intended project using private configuration.
   Run `npm run demo:bootstrap` to see its help without reading environment secrets
   or writing anything. Then explicitly run
   `npm run demo:bootstrap -- --confirm-shared-metadata-write` using trusted operator
   credentials. It uses the existing comprehensive importer, never copies personal
   data, and registers the catalogue only after all six imports pass. A failed
   import can leave additive shared metadata writes; keep demo off and retry.
   `npm run demo:bootstrap -- --check` verifies server-only imports without loading
   local environment configuration or making network/database requests.
3. Create a Cloudflare Turnstile widget with the correct domain allowlist. Put only
   its public site key in `NEXT_PUBLIC_TURNSTILE_SITE_KEY`. Configure its secret in
   Supabase Auth CAPTCHA settings, never in a browser variable or source control.
   Use Cloudflare test keys for local/staging tests, never production protection.
4. Deploy CAPTCHA-ready signin/signup/recovery forms with demo still disabled,
   then enable native Supabase CAPTCHA and test all three flows. Do not enable
   native CAPTCHA while an older deployment without token forwarding is serving.
   The same setting protects direct anonymous Auth API calls, not just the UI.
   Supabase validates tokens; do not consume them a second time through Siteverify.
5. Enable anonymous sign-ins and review Supabase Auth IP limits and abuse controls.
   Enable `DEMO_ENABLED=true` last, through a new deployment. This repository does
   not apply migrations, change Supabase Auth settings, or preload production as
   part of tests/builds. [Anonymous Auth](https://supabase.com/docs/guides/auth/auth-anonymous),
   [CAPTCHA configuration](https://supabase.com/docs/guides/auth/auth-captcha).

## Cleanup And Monitoring

`GET /api/cron/cleanup-guests` checks exact `Authorization: Bearer <CRON_SECRET>`
before database access. `?dryRun=1` is read-only; other supplied values return 400.
The daily schedule is 06:00 UTC. Metadata refresh stays at 05:00 UTC with five
sequential candidates, unchanged ordering and stale thresholds.

Cleanup deletes at most 100 accounts, oldest expiry/ID first. Auth rows are locked
before deletion, with a current anonymous identity check protecting converted
accounts. Sessions and guest-owned rows are removed; shared metadata stays. The
transaction rolls back on failure. Converted accounts' obsolete registry rows
are removed without deleting their account/data. Logs/responses contain aggregate
counts and duration, not identities, tokens or credentials. Monitor `remaining`
and failures; daily physical deletion can lag expiry by a day or longer with a
backlog/missed invocation. Logical expiry does not depend on cron delivery.

## Verification

`tests/guest-database.test.ts` runs actual application migrations and RLS on
isolated PostgreSQL via development-only PGlite. Its Auth tables/claims are minimal
stand-ins, not a live Supabase Auth service. It verifies two guests/permanent user,
direct SQL permissions, forged user metadata, expiry/missing registration,
transaction rollback/retry, reset invariants, catalogue restriction, permanent
metadata demand, cleanup cascades/dry-run/100-account cap and converted protection.
Action/service/UI tests cover cached search/add, safe feedback and CAPTCHA tokens.

Before production enablement, run live Supabase staging QA with two browsers and
a permanent account: signin/signup/recovery; CAPTCHA rejection/expiry/retry; demo
creation/resume/reset/exit; direct REST isolation and restricted RPC permissions;
saved timezone and Specials; expiration while a tab is open; cleanup dry-run and
real cleanup of staging-only expired accounts. Test simultaneous seed/reset,
cleanup and identity conversion using two database connections. Run advisors and
inspect grants. Check keyboard/mobile behavior and all existing tracking controls.

Run `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:e2e`,
`npm run build`, and `git diff --check`. Existing e2e tests are fixture acceptance
tests, not live Supabase/browser coverage. CAPTCHA and Auth rate limits mitigate
abuse but cannot guarantee it will not happen; monitor creation failures and volume.

The rollout updates Next.js within the existing 15.5 release line to 15.5.27 and
pins patched PostCSS/Sharp dependencies. `npm audit --omit=dev` reported zero
production vulnerabilities after these changes. Recheck the audit before future
releases; development dependencies are not covered by this production-only check.

The companion migration `20261008004252_harden_auth_trigger_grants.sql` revokes
unnecessary client execution of existing trigger functions. Normal Auth-trigger
execution is preserved. Apply it alongside the guest migration.

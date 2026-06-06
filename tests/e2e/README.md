# E2E Acceptance Tests

The current v2 app uses live Supabase Auth/database calls and server-side TMDB routes, but the repository does not yet include a local Supabase stack, seed data, or a browser automation dependency. These acceptance tests therefore run against local in-memory fixtures that model the same critical product boundaries:

- Supabase Auth session lifecycle
- TMDB show search and full show fixture data
- User-owned library rows
- Episode watched progress
- User preference persistence
- User-scoped export data

This keeps the critical flows covered without weakening production code for tests. When a local Supabase project and Playwright/Cypress setup are added, these scenarios should become browser-backed tests that exercise the real pages and route handlers.

Run the acceptance suite with:

```bash
npm run test:e2e
```

The tests also run as part of:

```bash
npm test
```

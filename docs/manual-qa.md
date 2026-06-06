# Episodic v2 Manual QA

## Current State

Episodic v2 has the derived-status tracking model implemented:

- `watched_episodes` is the source of truth for progress.
- `dropped` is the only manual status override.
- `caught_up` and `completed` are computed display statuses.
- Library and Search provide paths to Show Detail.
- Show Detail has Favourite/Unfavourite and Drop/Resume controls.
- Progress page cards show derived status badges.

## Local Supabase Smoke Test

Status: Passed

Environment:

- Fresh Supabase v2 project
- v1 Supabase project untouched
- v2 migrations applied in documented order
- Local app connected through `v2/.env.local`

Validated:

- App starts locally
- User can sign up/sign in
- TMDB search works
- Show can be added to library
- Data persists after refresh
- Basic Supabase connection and RLS flow are functional

## Full Manual QA Checklist

### 1. Auth: Sign Up, Sign In, Sign Out, Session Restore

- [ ] Pass
- [ ] Fail

Preconditions:

- Local or staging app is connected to the v2 Supabase project.
- Supabase Auth Site URL and Redirect URL are configured for the tested environment.
- Tester has access to a fresh email address or a disposable test account.

Steps:

1. Open the app while signed out.
2. Create a new account.
3. Confirm the account if email confirmation is enabled.
4. Sign out.
5. Sign back in with the same credentials.
6. Refresh the page.
7. Close and reopen the browser tab.

Expected result:

- Signed-out users are redirected to auth pages.
- Sign up creates an authenticated session or shows the email-confirmation message.
- Sign in reaches the protected app.
- Sign out returns to Sign In.
- Refreshing or reopening restores the authenticated session.

### 2. TMDB Search And Add Show

- [ ] Pass
- [ ] Fail

Preconditions:

- Tester is signed in.
- `TMDB_API_KEY` is configured server-side.
- The test account has at least one known show not yet in the library.

Steps:

1. Go to Search.
2. Search for a known TV show.
3. Confirm results render with title, overview, poster when available, and TMDB attribution.
4. Click Add on one result.
5. Refresh the page or go to Library.

Expected result:

- Search calls the app API route, not TMDB directly from the browser.
- The show is added once.
- Show, season, and episode metadata are available when TMDB provides them.
- The added show persists after refresh.

### 3. Search To Track Navigation

- [ ] Pass
- [ ] Fail

Preconditions:

- Tester is signed in.
- At least one searched show is already in the user's library.

Steps:

1. Go to Search.
2. Search for the already-added show.
3. Locate the added result.
4. Click Track.

Expected result:

- Added search results show a clear Track action.
- Track navigates to `/shows/[tmdbId]`.
- The detail page loads for the user's library show.

### 4. Library To Detail Navigation

- [ ] Pass
- [ ] Fail

Preconditions:

- Tester is signed in.
- User library contains at least one show.

Steps:

1. Go to Library.
2. Click the show title.
3. Return to Library.
4. Click the show poster.
5. Return to Library.
6. Click Details.

Expected result:

- Title, poster, and Details each navigate to Show Detail.
- Favourite, Drop/Resume, and Remove controls do not accidentally trigger navigation.
- Keyboard focus can reach the navigation links and action buttons.

### 5. Favourite/Unfavourite From Library And Show Detail

- [ ] Pass
- [ ] Fail

Preconditions:

- Tester is signed in.
- User library contains at least one show.

Steps:

1. Toggle Favourite from the Library card.
2. Refresh Library.
3. Open Show Detail.
4. Toggle Unfavourite.
5. Refresh Show Detail and Library.

Expected result:

- Favourite state persists across refreshes.
- Favourite is independent of progress and display status.
- Library favourite filter reflects the current favourite state.
- Show Detail and Library stay consistent.

### 6. Drop/Resume From Library And Show Detail

- [ ] Pass
- [ ] Fail

Preconditions:

- Tester is signed in.
- User library contains a show with at least one watched episode.

Steps:

1. Drop the show from Library and confirm the prompt.
2. Verify the Library badge shows Dropped.
3. Open Show Detail.
4. Verify dropped-state messaging is visible.
5. Resume the show from Show Detail.
6. Drop the show from Show Detail.
7. Resume the show from Library.

Expected result:

- Dropping preserves watched progress.
- Dropped overrides the computed display status.
- Resuming clears the dropped override and recomputes status from progress.
- Drop/Resume are the only manual status controls.

### 7. Episode Watched/Unwatched

- [ ] Pass
- [ ] Fail

Preconditions:

- Tester is signed in.
- Show Detail is open for a library show with episode metadata.

Steps:

1. Mark one episode watched.
2. Refresh Show Detail.
3. Mark the same episode unwatched and confirm the prompt.
4. Refresh Show Detail.

Expected result:

- Watched state persists after refresh.
- Unwatched state persists after refresh.
- Progress count and percentage update accurately.
- Display status is derived from progress.

### 8. Season Watched/Unwatched

- [ ] Pass
- [ ] Fail

Preconditions:

- Tester is signed in.
- Show Detail is open for a library show with at least one season containing released episodes.

Steps:

1. Click Watch season.
2. Confirm all released/trackable episodes in that season are watched.
3. Refresh Show Detail.
4. Click Unwatch season and confirm the prompt.
5. Refresh Show Detail.

Expected result:

- Season watched action marks all released/trackable episodes in the season watched.
- Season unwatched action clears watched rows for that season.
- Show-level and season-level progress update consistently.

### 9. Whole Show Watched

- [ ] Pass
- [ ] Fail

Preconditions:

- Tester is signed in.
- Show Detail is open for a library show with released episode metadata.

Steps:

1. Click Mark watched.
2. Refresh Show Detail.
3. Check Library and Progress.

Expected result:

- All released/trackable episodes are marked watched.
- Future unaired episodes do not prevent `caught_up` when air dates are available.
- Ended/cancelled/finished shows display Completed when all released/trackable episodes are watched.

### 10. Reset Progress

- [ ] Pass
- [ ] Fail

Preconditions:

- Tester is signed in.
- Show Detail is open for a library show with watched progress.

Steps:

1. Click Reset.
2. Confirm the prompt.
3. Refresh Show Detail.
4. Check Library, Progress, and Dashboard.

Expected result:

- Watched episode rows for that show are cleared.
- Library entry is preserved.
- Favourite state is preserved.
- If the show is not dropped, display status becomes Watchlist.
- If the show is dropped, dropped override remains.

### 11. Display Statuses

- [ ] Pass
- [ ] Fail

Preconditions:

- Tester is signed in.
- Test library contains shows or fixtures that can represent each display status.

Steps:

1. Verify a show with zero watched released episodes displays Watchlist.
2. Verify a show with partial progress displays Watching.
3. Verify an ongoing show with all released episodes watched displays Caught up.
4. Verify an ended/cancelled/finished show with all released episodes watched displays Completed.
5. Verify a dropped show displays Dropped regardless of progress.

Expected result:

- Status labels match the derived-status model.
- No generic manual controls exist for Watchlist, Watching, Caught up, or Completed.
- Raw `user_shows.status` does not create contradictory UI states.

### 12. Progress Page Badges

- [ ] Pass
- [ ] Fail

Preconditions:

- Tester is signed in.
- User library contains at least one show.

Steps:

1. Go to Progress.
2. Inspect each progress card.
3. Use different library states to verify Watchlist, Watching, Caught up, Completed, and Dropped badges.
4. Click Details from a progress card.

Expected result:

- Every Progress card shows a compact derived status badge.
- Progress count, remaining episode text, progress bar, and Details link remain visible.
- Badge labels match Library and Show Detail wording.

### 13. Dashboard Continue Watching

- [ ] Pass
- [ ] Fail

Preconditions:

- Tester is signed in.
- User library contains watchlist, watching, caught-up/completed, and dropped examples.

Steps:

1. Go to Dashboard.
2. Verify Library Summary counts.
3. Verify Continue Watching entries.
4. Drop a currently watching show.
5. Return to Dashboard.
6. Resume the show and return to Dashboard.

Expected result:

- Summary counts represent the full library.
- Continue Watching includes only active in-progress Watching shows.
- Dropped, Completed, Caught up, and Watchlist shows do not appear in Continue Watching.
- Resumed shows reappear only when derived status is Watching.

### 14. Preferences Behavior

- [ ] Pass
- [ ] Fail

Preconditions:

- Tester is signed in.
- User library contains dropped and completed examples.
- Search results include at least one already-added show.

Steps:

1. Go to Profile.
2. Enable Hide dropped shows.
3. Check Library, Dashboard, and Progress.
4. Enable Fade dropped shows while Hide dropped is off.
5. Enable Hide completed shows only.
6. Search for an already-added show and test Fade added search results and Hide added search results.

Expected result:

- Hide dropped removes dropped shows from preference-aware views.
- Fade dropped dims dropped shows only when they are not hidden.
- Hide completed shows only hides Completed, not Caught up.
- Added-show preferences apply to TMDB Search results.
- Preferences persist after refresh and sign-in restore.

### 15. Export Data

- [ ] Pass
- [ ] Fail

Preconditions:

- Tester is signed in.
- User account has profile, preferences, library, and watched progress data.

Steps:

1. Go to Profile.
2. Click Export JSON.
3. Open the downloaded JSON file.

Expected result:

- Export downloads successfully.
- Export includes only the authenticated user's profile, preferences, library rows, and watched episodes.
- Shared secrets and other users' data are not present.

### 16. Clear Watched History

- [ ] Pass
- [ ] Fail

Preconditions:

- Tester is signed in.
- User library contains watched progress across watching, watched, watchlist, and dropped shows.

Steps:

1. Go to Profile.
2. Click Clear watched.
3. Cancel the confirmation prompt.
4. Click Clear watched again.
5. Enter `CLEAR WATCHED HISTORY`.
6. Check Library, Show Detail, Progress, and Dashboard.

Expected result:

- Cancelling does nothing.
- Server-side confirmation phrase is required.
- Watched episode rows for the authenticated user are removed.
- Watching and Watched compatibility statuses reset to Watchlist.
- Dropped shows remain Dropped.
- Favourite and library entries are preserved.

### 17. Reset Library

- [ ] Pass
- [ ] Fail

Preconditions:

- Tester is signed in.
- User library contains multiple shows with favourites and watched progress.

Steps:

1. Go to Profile.
2. Click Reset library.
3. Cancel the confirmation prompt.
4. Click Reset library again.
5. Enter `RESET LIBRARY`.
6. Check Library, Dashboard, Progress, Search, and Export.

Expected result:

- Cancelling does nothing.
- Server-side confirmation phrase is required.
- User library rows are removed.
- Associated watched progress is removed.
- Shared TMDB metadata remains available.
- Other users are unaffected.

### 18. Delete Account

- [ ] Pass
- [ ] Fail

Preconditions:

- Tester is signed in with a disposable test account.
- `SUPABASE_SERVICE_ROLE_KEY` is configured server-side.

Steps:

1. Go to Profile.
2. Submit Delete account with an incorrect confirmation value.
3. Submit Delete account with the exact displayed confirmation value.
4. Attempt to sign in again with the deleted account.
5. Verify user-owned rows are removed in Supabase.

Expected result:

- Incorrect confirmation is rejected server-side.
- Correct confirmation deletes the auth user.
- User is signed out and redirected.
- User-owned profile, preferences, library, and watched progress are removed through cascades.

### 19. Mobile Layout Checks

- [ ] Pass
- [ ] Fail

Preconditions:

- App is running locally or in staging.
- Browser dev tools or physical mobile devices are available.

Steps:

1. Test Sign In and Sign Up at mobile widths.
2. Test Dashboard, Search, Library, Progress, Show Detail, and Profile at mobile widths.
3. Verify action buttons, badges, nav, and dialogs/prompts.
4. Verify long titles and long episode names.

Expected result:

- Content does not overlap.
- Buttons remain reachable and readable.
- Cards, forms, badges, and navigation adapt cleanly.
- Destructive actions are not easy to trigger accidentally.

### 20. Vercel Staging Checks

- [ ] Pass
- [ ] Fail

Preconditions:

- Vercel project is configured with root directory `v2`.
- Staging environment variables are configured.
- Supabase staging Auth redirect URLs include the staging domain.
- v2 migrations have been applied to the staging Supabase project.

Steps:

1. Deploy to Vercel staging.
2. Confirm the build succeeds.
3. Open the staging URL.
4. Run the auth, search, add-show, tracking, preference, export, and destructive-action smoke flows.
5. Check server logs for unexpected TMDB or Supabase errors.

Expected result:

- Vercel builds from `v2`.
- Auth redirects return to the staging app.
- Server-only Supabase and TMDB values are not exposed to browser code.
- Core user flows work against the staging Supabase project.
- No unexpected runtime errors appear in logs.

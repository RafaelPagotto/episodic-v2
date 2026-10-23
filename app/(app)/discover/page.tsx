import { redirect } from "next/navigation";
import { requireCurrentUser } from "@/features/auth/session";
import { DiscoverView } from "@/features/discover/components/discover-view";
import { loadDiscoverListing, loadDiscoverSearch } from "@/features/discover/server";
import { discoverHref, parseDiscoverState } from "@/features/discover/state";
import { getGuestSession } from "@/features/guest/server";
import { getUserPreferences } from "@/features/preferences/data";
import { getUserLibraryShowIds } from "@/features/search/data";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Discover | Episodic" };
export default async function DiscoverPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireCurrentUser();
  const raw = await searchParams;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    if (Array.isArray(value)) value.forEach((entry) => params.append(key, entry));
    else if (value !== undefined) params.append(key, value);
  }
  const demo = Boolean(user.is_anonymous);
  const state = parseDiscoverState(params, demo);
  const href = discoverHref(state);
  if (href !== `/discover${params.size ? `?${params}` : ""}`) redirect(href);
  const client = await createSupabaseServerClient();
  const guest = demo ? await getGuestSession(client, user) : null;
  let membership;
  try {
    membership = await Promise.all([getUserLibraryShowIds(client, user.id), getUserPreferences(client, user.id)]);
  } catch {
    return <section className="mx-auto max-w-6xl"><h1 className="text-2xl font-semibold">Discover</h1><p className="mt-5">Your library could not be loaded. Please try again.</p><a className="title-link mt-3 inline-flex min-h-11 items-center" href={href}>Retry</a></section>;
  }
  const initialListing = state.q ? loadDiscoverSearch(user, state.q, state.searchPage) : loadDiscoverListing(user, demo ? "demo" : state.feed, state.page);
  const accountScope = `${user.id}:${guest?.seeded_at ?? "permanent"}`;
  return <DiscoverView key={accountScope} accountScope={accountScope} demo={demo} initialState={state} initialListing={initialListing} initialAddedShowIds={membership[0]} preferences={membership[1]} />;
}

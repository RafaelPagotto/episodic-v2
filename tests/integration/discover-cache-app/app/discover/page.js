import { DiscoverView } from "@/features/discover/components/discover-view";
import { parseDiscoverState } from "@/features/discover/state";
import { DEFAULT_USER_PREFERENCES } from "@/features/preferences/defaults";
import { listing } from "../../listing";

export const dynamic = "force-dynamic";
export default async function Page({ searchParams }) {
  const state = parseDiscoverState(new URLSearchParams(await searchParams));
  return <DiscoverView accountScope="next-router-fixture" demo={false} initialState={state}
    initialListing={Promise.resolve({ data: listing(state) })} initialAddedShowIds={[]}
    preferences={DEFAULT_USER_PREFERENCES} />;
}

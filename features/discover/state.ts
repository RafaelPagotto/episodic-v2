import { isDiscoverFeed } from "./policy";
import type { DiscoverFeed } from "./types";

export type DiscoverState = { feed: DiscoverFeed; page: number; q: string; searchPage: number };
function page(value: string | null, cap: number) {
  return value && /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) <= cap ? Number(value) : 1;
}
export function parseDiscoverState(params: URLSearchParams, demo = false): DiscoverState {
  const feed = params.get("feed");
  const q = (params.get("q") ?? "").trim();
  return { feed: !demo && isDiscoverFeed(feed) ? feed : "trending",
    page: demo ? 1 : page(params.get("page"), 10), q: q.length <= 100 ? q : "",
    searchPage: demo || !q || q.length > 100 ? 1 : page(params.get("searchPage"), 500) };
}
export function discoverHref(state: DiscoverState, hash = "") {
  const params = new URLSearchParams();
  if (state.feed !== "trending") params.set("feed", state.feed);
  if (state.page !== 1) params.set("page", String(state.page));
  if (state.q) {
    params.set("q", state.q);
    if (state.searchPage !== 1) params.set("searchPage", String(state.searchPage));
  }
  return `/discover${params.size ? `?${params}` : ""}${hash}`;
}
export function discoverKey(state: DiscoverState, demo: boolean) {
  return JSON.stringify(state.q ? [demo ? "demo-search" : "search", state.q, state.searchPage, "en-US"] :
    [demo ? "demo" : state.feed, state.page, "en-US"]);
}
export function discoverRequest(state: DiscoverState, demo: boolean) {
  return state.q ? `/api/tmdb/search?${new URLSearchParams({ query: state.q, page: String(state.searchPage), language: "en-US" })}` :
    `/api/tmdb/discover?${new URLSearchParams({ feed: demo ? "demo" : state.feed, page: String(state.page), language: "en-US" })}`;
}

import { state } from "./clock";
export async function discoverTmdbShows(feed, page) {
  state.count++;
  if (state.fail) throw new Error("Controlled upstream failure");
  return { attribution: {}, results: [{ tmdbId: state.count, title: `Fixture ${feed}` }], page, totalPages: 100, totalResults: 2000 };
}

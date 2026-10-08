import "server-only";

import type { SupabaseClient, User } from "@supabase/supabase-js";
import { getPersistedUserTimeZoneForMutation } from "../profile/timezone";
import { getDateOnlyForTimeZone, normalizeTimeZone, resolveTimeZone } from "../../lib/date-only";
import { createOptionalSupabaseServiceRoleClient } from "../../lib/supabase/admin";
import type { Database } from "@/lib/supabase/types";
import { TMDB_ATTRIBUTION } from "../../lib/tmdb/attribution";
import type { NormalizedTmdbSearchResponse } from "@/lib/tmdb/types";
import { DEMO_SHOWS } from "./catalogue";
import type { EpisodeProgress } from "@/features/tracking/types";
import { buildGuestSeed } from "./seed";

type Client = SupabaseClient<Database>;
export function isDemoEnabled() {
  return process.env.DEMO_ENABLED === "true" && Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);
}

export async function getGuestSession(client: Client, user: User) {
  if (!user.is_anonymous) return null;
  const { data, error } = await client.from("guest_sessions").select("expires_at,seeded_at").eq("user_id", user.id).maybeSingle();
  if (error) throw new Error("Unable to load demo session.");
  return data;
}

export async function isGuestReady(client: Client, user: User) {
  if (!user.is_anonymous) return true;
  const session = await getGuestSession(client, user);
  return Boolean(session?.seeded_at && Date.parse(session.expires_at) > Date.now());
}

export async function initializeGuest(user: User, browserTimeZone: unknown, reset = false) {
  if (!user.is_anonymous) throw new Error("Demo access required.");
  const admin = createOptionalSupabaseServiceRoleClient();
  if (!admin) throw new Error("Demo is not configured.");
  const session = await getGuestSession(admin, user);
  if (!session || Date.parse(session.expires_at) <= Date.now()) throw new Error("Demo expired.");
  if (session.seeded_at && !reset) return;
  const { data: catalogue, error } = await admin.from("demo_catalogue").select("show_tmdb_id").order("display_order");
  if (error || catalogue?.length !== DEMO_SHOWS.length || DEMO_SHOWS.some((show) => !catalogue.some((row) => row.show_tmdb_id === show.tmdbId))) {
    throw new Error("Demo catalogue is not ready.");
  }
  const profile = await getPersistedUserTimeZoneForMutation(admin, user.id);
  const timeZone = resolveTimeZone(profile.timeZone ?? normalizeTimeZone(browserTimeZone));
  const episodes: EpisodeProgress[] = [];
  let offset = 0;
  while (true) {
    const { data, error: episodeError } = await admin.from("episodes")
      .select("show_tmdb_id,season_number,episode_number,air_date").in("show_tmdb_id", catalogue.map((row) => row.show_tmdb_id))
      .order("id").range(offset, offset + 999);
    if (episodeError || !data) throw new Error("Unable to prepare demo.");
    if (!data.length) break;
    episodes.push(...data.map((row) => ({ showTmdbId: row.show_tmdb_id, seasonNumber: row.season_number, episodeNumber: row.episode_number, airDate: row.air_date })));
    offset += data.length;
  }
  if (DEMO_SHOWS.some((show) => !episodes.some((episode) => episode.showTmdbId === show.tmdbId && episode.seasonNumber > 0))) {
    throw new Error("Demo episodes are not ready.");
  }
  const seed = buildGuestSeed(episodes, { timeZone, referenceDate: getDateOnlyForTimeZone(new Date(), timeZone) });
  const { error: seedError } = await admin.rpc("seed_guest_demo", {
    p_user_id: user.id, p_timezone: timeZone, p_expected_timezone: profile.rawTimeZone,
    p_library: seed.library, p_watched: seed.watched, p_reset: reset,
  });
  if (seedError) throw new Error("Unable to prepare demo.");
}

export async function searchDemoCatalogue(client: Client, query: string, page: number): Promise<NormalizedTmdbSearchResponse> {
  const { data: catalogue, error: catalogueError } = await client.from("demo_catalogue").select("show_tmdb_id").order("display_order");
  if (catalogueError || !catalogue) throw new Error("Unable to search demo.");
  const { data, error } = await client.from("shows").select("*").in("tmdb_id", catalogue.map((row) => row.show_tmdb_id));
  if (error || !data) throw new Error("Unable to search demo.");
  const results = catalogue.flatMap(({ show_tmdb_id }) => {
    const show = data.find((row) => row.tmdb_id === show_tmdb_id);
    if (!show || !`${show.title} ${show.original_title ?? ""}`.toLowerCase().includes(query.toLowerCase())) return [];
    return [{
      tmdbId: show.tmdb_id, title: show.title, originalTitle: show.original_title,
      overview: show.overview, posterPath: show.poster_path, backdropPath: show.backdrop_path,
      firstAirDate: show.first_air_date, originalLanguage: show.original_language,
      popularity: show.popularity, voteAverage: show.vote_average, voteCount: show.vote_count,
      genreIds: [], originCountries: [],
    }];
  });
  return { attribution: TMDB_ATTRIBUTION, page, results: page === 1 ? results : [], totalPages: results.length ? 1 : 0, totalResults: results.length };
}

export async function addCachedDemoShow(client: Client, user: User, tmdbId: number) {
  if (!user.is_anonymous || !await isGuestReady(client, user)) throw new Error("Demo expired.");
  const { data: allowed, error: allowedError } = await client.from("demo_catalogue").select("show_tmdb_id").eq("show_tmdb_id", tmdbId).maybeSingle();
  if (allowedError || !allowed) throw new Error("Show unavailable in demo.");
  const { data: show, error: showError } = await client.from("shows").select("title").eq("tmdb_id", tmdbId).single();
  if (showError || !show) throw new Error("Show unavailable in demo.");
  const { error } = await client.from("user_shows").insert({ user_id: user.id, show_tmdb_id: tmdbId, status: "watchlist", favourite: false });
  if (error && error.code !== "23505") throw new Error("Unable to add demo show.");
  return { title: show.title, duplicate: error?.code === "23505" };
}

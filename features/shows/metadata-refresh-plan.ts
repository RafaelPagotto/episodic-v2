import { compareDateOnly, getDateOnlyForTimeZone, isDateOnly } from "../../lib/date-only";
import type { Json } from "../../lib/supabase/types";
import type { TmdbTvDetailsResponse } from "../../lib/tmdb/types";

export type StoredRefreshSeason = {
  season_number: number;
  tmdb_id: number | null;
  episode_count: number;
  metadata: Json;
};
export type StoredRefreshEpisode = {
  season_number: number;
  episode_number: number;
  tmdb_id: number | null;
  air_date: string | null;
};

export function metadataObject(value: Json): { [key: string]: Json | undefined } {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export function buildMetadataRefreshPlan(
  show: TmdbTvDetailsResponse,
  seasons: StoredRefreshSeason[],
  episodes: StoredRefreshEpisode[],
  now = new Date(),
) {
  const inactive = new Set(["ended", "canceled", "cancelled"]).has(show.status?.trim().toLowerCase() ?? "");
  const summaries = show.seasons ?? [];
  const main = summaries.map((s) => s.season_number!).filter((n) => n > 0).sort((a, b) => a - b);
  const anchors = [show.last_episode_to_air?.season_number, show.next_episode_to_air?.season_number]
    .filter((n): n is number => typeof n === "number" && main.includes(n));
  // Announced higher seasons must not displace an explicitly airing season.
  const latest = anchors.length ? Math.max(...anchors) : main.at(-1);
  const previous = [...main].reverse().find((n) => latest !== undefined && n < latest);
  const today = getDateOnlyForTimeZone(now);
  const stored = new Map(seasons.map((s) => [s.season_number, s]));

  return summaries.map((summary) => {
    const number = summary.season_number!;
    const old = stored.get(number);
    const rows = episodes.filter((e) => e.season_number === number);
    const marker = old && metadataObject(old.metadata).episodesLastSyncedAt;
    const detailTime = typeof marker === "string" ? Date.parse(marker) : NaN;
    const reasons: string[] = [];
    if (inactive) reasons.push("inactive-full");
    if (!old) reasons.push("new-season");
    if (old && metadataObject(old.metadata).episodesRefreshPending === true) reasons.push("detail-refresh-pending");
    if (!Number.isFinite(detailTime)) reasons.push("missing-detail-sync");
    else if (now.getTime() - detailTime >= 180 * 86400000) reasons.push("historical-due");
    if (old && old.episode_count !== summary.episode_count) reasons.push("count-changed");
    if (rows.length < summary.episode_count!) reasons.push("catalogue-shortfall");
    if (number > 0 && (anchors.includes(number) || number === latest || number === previous)) reasons.push("recent-main-season");
    if (number > 0 && (
      !isDateOnly(summary.air_date) || compareDateOnly(summary.air_date, today) > 0
      || rows.some((e) => !isDateOnly(e.air_date) || compareDateOnly(e.air_date, today) > 0)
    )) reasons.push("unresolved-schedule");
    return { seasonNumber: number, reasons };
  }).filter((entry) => entry.reasons.length > 0).sort((a, b) => a.seasonNumber - b.seasonNumber);
}

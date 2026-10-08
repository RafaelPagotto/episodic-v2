import { deriveTrackingStatusAfterProgressChange, getReleasedTrackableEpisodes } from "../tracking/progress";
import type { EpisodeCalculationOptions } from "../tracking/progress";
import type { EpisodeProgress } from "../tracking/types";
import { DEMO_SHOWS } from "./catalogue";

export function buildGuestSeed(episodes: EpisodeProgress[], options: EpisodeCalculationOptions) {
  const watched: { show_tmdb_id: number; season_number: number; episode_number: number }[] = [];
  const library = DEMO_SHOWS.filter((show) => show.tmdbId !== 106379).map((show) => {
    const eligible = getReleasedTrackableEpisodes(episodes.filter((episode) => episode.showTmdbId === show.tmdbId), options)
      .sort((a, b) => a.seasonNumber - b.seasonNumber || a.episodeNumber - b.episodeNumber);
    const selected = show.watched === "all" ? eligible : eligible.slice(0, show.watched);
    watched.push(...selected.map((episode) => ({
      show_tmdb_id: episode.showTmdbId,
      season_number: episode.seasonNumber,
      episode_number: episode.episodeNumber,
    })));
    return {
      show_tmdb_id: show.tmdbId,
      favourite: show.favourite,
      status: deriveTrackingStatusAfterProgressChange({
        trackingStatus: show.dropped ? "dropped" : "watchlist",
        totalEpisodeCount: eligible.length,
        watchedEpisodeCount: selected.length,
      }),
    };
  });
  return { library, watched };
}

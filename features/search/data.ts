import type { SupabaseClient } from "@supabase/supabase-js";

import type { NormalizedTmdbFullShow } from "@/lib/tmdb/types";
import type { Database } from "@/lib/supabase/types";

import {
  mapTmdbEpisodeToEpisodeInsert,
  mapTmdbSeasonToSeasonInsert,
  mapTmdbShowToShowInsert,
} from "./mappers";

type EpisodicSupabaseClient = SupabaseClient<Database>;

type AddShowToLibraryInput = {
  metadataClient: EpisodicSupabaseClient;
  tmdbShow: NormalizedTmdbFullShow;
  userClient: EpisodicSupabaseClient;
  userId: string;
};

type UpsertTmdbShowMetadataInput = {
  lastSyncedAt?: string;
  metadataClient: EpisodicSupabaseClient;
  tmdbShow: NormalizedTmdbFullShow;
};

export type AddShowToLibraryResult = {
  episodeCount: number;
  seasonCount: number;
  status: "added" | "duplicate";
  tmdbId: number;
  title: string;
};

export type UpsertTmdbShowMetadataResult = {
  episodeCount: number;
  lastSyncedAt: string;
  seasonCount: number;
  tmdbId: number;
  title: string;
};

export class SearchDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SearchDataError";
  }
}

function isUniqueViolation(error: { code?: string } | null) {
  return error?.code === "23505";
}

function throwDataError(error: { message?: string } | null, fallbackMessage: string) {
  if (error) {
    throw new SearchDataError(fallbackMessage);
  }
}

export async function getUserLibraryShowIds(supabase: EpisodicSupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from("user_shows")
    .select("show_tmdb_id")
    .eq("user_id", userId);

  throwDataError(error, "Unable to load user library.");

  return data?.map((row) => row.show_tmdb_id) ?? [];
}

export async function upsertTmdbShowMetadata({
  lastSyncedAt = new Date().toISOString(),
  metadataClient,
  tmdbShow,
}: UpsertTmdbShowMetadataInput): Promise<UpsertTmdbShowMetadataResult> {
  const { error: showError } = await metadataClient
    .from("shows")
    .upsert(mapTmdbShowToShowInsert(tmdbShow, lastSyncedAt), { onConflict: "tmdb_id" });

  throwDataError(showError, "Unable to save show metadata.");

  if (tmdbShow.seasons.length > 0) {
    const { error: seasonsError } = await metadataClient
      .from("seasons")
      .upsert(
        tmdbShow.seasons.map((season) => mapTmdbSeasonToSeasonInsert(season, lastSyncedAt)),
        { onConflict: "show_tmdb_id,season_number" },
      );

    throwDataError(seasonsError, "Unable to save season metadata.");
  }

  if (tmdbShow.episodes.length > 0) {
    const { error: episodesError } = await metadataClient
      .from("episodes")
      .upsert(
        tmdbShow.episodes.map((episode) => mapTmdbEpisodeToEpisodeInsert(episode, lastSyncedAt)),
        { onConflict: "show_tmdb_id,season_number,episode_number" },
      );

    throwDataError(episodesError, "Unable to save episode metadata.");
  }

  return {
    episodeCount: tmdbShow.episodes.length,
    lastSyncedAt,
    seasonCount: tmdbShow.seasons.length,
    title: tmdbShow.show.title,
    tmdbId: tmdbShow.show.tmdbId,
  };
}

export async function addTmdbShowToLibrary({
  metadataClient,
  tmdbShow,
  userClient,
  userId,
}: AddShowToLibraryInput): Promise<AddShowToLibraryResult> {
  const tmdbId = tmdbShow.show.tmdbId;
  const existingShowIds = await getUserLibraryShowIds(userClient, userId);

  if (existingShowIds.includes(tmdbId)) {
    return {
      episodeCount: tmdbShow.episodes.length,
      seasonCount: tmdbShow.seasons.length,
      status: "duplicate",
      title: tmdbShow.show.title,
      tmdbId,
    };
  }

  const metadataResult = await upsertTmdbShowMetadata({ metadataClient, tmdbShow });

  const { error: userShowError } = await userClient.from("user_shows").insert({
    favourite: false,
    show_tmdb_id: tmdbId,
    status: "watchlist",
    user_id: userId,
  });

  if (isUniqueViolation(userShowError)) {
    return {
      episodeCount: metadataResult.episodeCount,
      seasonCount: metadataResult.seasonCount,
      status: "duplicate",
      title: metadataResult.title,
      tmdbId: metadataResult.tmdbId,
    };
  }

  throwDataError(userShowError, "Unable to add show to your library.");

  return {
    episodeCount: metadataResult.episodeCount,
    seasonCount: metadataResult.seasonCount,
    status: "added",
    title: metadataResult.title,
    tmdbId: metadataResult.tmdbId,
  };
}

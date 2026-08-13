import type { SupabaseClient } from "@supabase/supabase-js";

import {
  getDateOnlyForTimeZone,
  normalizeTimeZone,
  resolveTimeZone,
} from "../../lib/date-only";
import type { Database } from "@/lib/supabase/types";

type EpisodicSupabaseClient = SupabaseClient<Database>;

export class ProfileTimeZoneDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProfileTimeZoneDataError";
  }
}

async function loadPersistedUserTimeZone(
  supabase: EpisodicSupabaseClient,
  userId: string,
) {
  return supabase
    .from("profiles")
    .select("timezone")
    .eq("id", userId)
    .limit(1);
}

export async function getPersistedUserTimeZone(
  supabase: EpisodicSupabaseClient,
  userId: string,
) {
  const { data, error } = await loadPersistedUserTimeZone(supabase, userId);

  if (error) {
    return null;
  }

  return normalizeTimeZone(data?.[0]?.timezone);
}

export async function getPersistedUserTimeZoneForMutation(
  supabase: EpisodicSupabaseClient,
  userId: string,
) {
  const { data, error } = await loadPersistedUserTimeZone(supabase, userId);

  if (error) {
    throw new ProfileTimeZoneDataError("Unable to load your timezone right now.");
  }

  const profile = data?.[0];

  return {
    profileExists: Boolean(profile),
    rawTimeZone: profile?.timezone ?? null,
    timeZone: normalizeTimeZone(profile?.timezone),
  };
}

export async function getUserTimeZone(supabase: EpisodicSupabaseClient, userId: string) {
  return resolveTimeZone(await getPersistedUserTimeZone(supabase, userId));
}

export async function updateUserTimeZone(
  supabase: EpisodicSupabaseClient,
  userId: string,
  value: unknown,
) {
  const timeZone = normalizeTimeZone(value);

  if (!timeZone) {
    throw new ProfileTimeZoneDataError("Select a valid IANA timezone.");
  }

  const { data, error } = await supabase
    .from("profiles")
    .update({ timezone: timeZone })
    .eq("id", userId)
    .select("timezone")
    .limit(1);

  if (error || normalizeTimeZone(data?.[0]?.timezone) !== timeZone) {
    throw new ProfileTimeZoneDataError("Unable to save your timezone right now.");
  }

  return timeZone;
}

export async function initializeUserTimeZone(
  supabase: EpisodicSupabaseClient,
  userId: string,
  value: unknown,
  expectedPersistedValue: string | null,
) {
  const timeZone = normalizeTimeZone(value);

  if (!timeZone) {
    throw new ProfileTimeZoneDataError("Select a valid IANA timezone.");
  }

  let update = supabase
    .from("profiles")
    .update({ timezone: timeZone })
    .eq("id", userId);

  update = expectedPersistedValue === null
    ? update.is("timezone", null)
    : update.eq("timezone", expectedPersistedValue);

  const { data, error } = await update
    .select("timezone")
    .limit(1);

  if (error) {
    throw new ProfileTimeZoneDataError("Unable to save your timezone right now.");
  }

  return normalizeTimeZone(data?.[0]?.timezone) === timeZone ? timeZone : null;
}

export async function getUserDateOptions(
  supabase: EpisodicSupabaseClient,
  userId: string,
  instant: Date = new Date(),
) {
  const timeZone = await getUserTimeZone(supabase, userId);

  return {
    referenceDate: getDateOnlyForTimeZone(instant, timeZone),
    timeZone,
  };
}

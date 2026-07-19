import type { SupabaseClient } from "@supabase/supabase-js";

import { getDateOnlyForTimeZone, resolveTimeZone } from "../../lib/date-only";
import type { Database } from "@/lib/supabase/types";

type EpisodicSupabaseClient = SupabaseClient<Database>;

export async function getUserTimeZone(supabase: EpisodicSupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("id", userId)
    .limit(1);

  if (error) {
    return resolveTimeZone(null);
  }

  return resolveTimeZone(data?.[0]?.timezone);
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

"use server";

import { revalidatePath } from "next/cache";

import { normalizeTimeZone } from "../../lib/date-only";
import { createSupabaseServerClient } from "../../lib/supabase/server";

import type { TimeZoneActionState } from "./timezone-state";
import {
  getPersistedUserTimeZoneForMutation,
  initializeUserTimeZone,
  ProfileTimeZoneDataError,
  updateUserTimeZone,
} from "./timezone";

const INVALID_TIME_ZONE_MESSAGE = "Select a valid IANA timezone.";

function actionError(message: string): TimeZoneActionState {
  return {
    message,
    status: "error",
  };
}

function actionSuccess(timeZone: string): TimeZoneActionState {
  return {
    message: "Timezone saved.",
    status: "success",
    timeZone,
  };
}

function revalidateTimeZoneAwarePages() {
  revalidatePath("/dashboard");
  revalidatePath("/library");
  revalidatePath("/profile");
  revalidatePath("/progress");
  revalidatePath("/shows/[tmdbId]", "page");
}

async function getAuthenticatedContext() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  return { supabase, user };
}

export async function initializeUserTimeZoneAction(value: unknown): Promise<TimeZoneActionState> {
  try {
    const context = await getAuthenticatedContext();

    if (!context) {
      return actionError("Sign in to initialize your timezone.");
    }

    const detectedTimeZone = normalizeTimeZone(value);

    if (!detectedTimeZone) {
      return actionError(INVALID_TIME_ZONE_MESSAGE);
    }

    const existing = await getPersistedUserTimeZoneForMutation(
      context.supabase,
      context.user.id,
    );

    if (existing.timeZone) {
      return actionSuccess(existing.timeZone);
    }

    if (!existing.profileExists) {
      return actionError("Unable to initialize your timezone right now.");
    }

    const timeZone = await initializeUserTimeZone(
      context.supabase,
      context.user.id,
      detectedTimeZone,
      existing.rawTimeZone,
    );

    if (!timeZone) {
      const latest = await getPersistedUserTimeZoneForMutation(
        context.supabase,
        context.user.id,
      );

      return latest.timeZone
        ? actionSuccess(latest.timeZone)
        : actionError("Unable to initialize your timezone right now.");
    }

    revalidateTimeZoneAwarePages();

    return actionSuccess(timeZone);
  } catch (error) {
    if (error instanceof ProfileTimeZoneDataError) {
      return actionError(error.message);
    }

    return actionError("Unable to initialize your timezone right now.");
  }
}

export async function updateUserTimeZoneAction(
  _state: TimeZoneActionState,
  formData: FormData,
): Promise<TimeZoneActionState> {
  try {
    const context = await getAuthenticatedContext();

    if (!context) {
      return actionError("Sign in to update your timezone.");
    }

    const timeZone = await updateUserTimeZone(
      context.supabase,
      context.user.id,
      formData.get("timeZone"),
    );
    revalidateTimeZoneAwarePages();

    return actionSuccess(timeZone);
  } catch (error) {
    if (error instanceof ProfileTimeZoneDataError) {
      return actionError(error.message);
    }

    return actionError("Unable to save your timezone right now.");
  }
}

"use server";

import { revalidatePath } from "next/cache";

import { createSupabaseServerClient } from "@/lib/supabase/server";

import { getUserPreferences, PreferencesDataError, updateUserPreferences } from "./data";
import type { PreferencesFormState, UserPreferences } from "./types";

function formSuccess(message: string): PreferencesFormState {
  return {
    message,
    status: "success",
  };
}

function formError(message: string): PreferencesFormState {
  return {
    message,
    status: "error",
  };
}

function readCheckbox(formData: FormData, name: string) {
  return formData.get(name) === "on";
}

function readPreferencesFromFormData(formData: FormData, currentPreferences: UserPreferences): UserPreferences {
  return {
    ...currentPreferences,
    fadeAdded: readCheckbox(formData, "fadeAdded"),
    fadeDropped: readCheckbox(formData, "fadeDropped"),
    hideAdded: readCheckbox(formData, "hideAdded"),
    hideCompleted: readCheckbox(formData, "hideCompleted"),
    hideDropped: readCheckbox(formData, "hideDropped"),
  };
}

function revalidatePreferenceAwarePages() {
  revalidatePath("/dashboard");
  revalidatePath("/library");
  revalidatePath("/profile");
  revalidatePath("/progress");
  revalidatePath("/search");
}

export async function updatePreferencesAction(
  _state: PreferencesFormState,
  formData: FormData,
): Promise<PreferencesFormState> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      return formError("Sign in to update preferences.");
    }

    const currentPreferences = await getUserPreferences(supabase, user.id);

    await updateUserPreferences(supabase, user.id, readPreferencesFromFormData(formData, currentPreferences));
    revalidatePreferenceAwarePages();

    return formSuccess("Preferences saved.");
  } catch (error) {
    if (error instanceof PreferencesDataError) {
      return formError(error.message);
    }

    return formError("Unable to save preferences right now.");
  }
}

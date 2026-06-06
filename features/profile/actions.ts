"use server";

import type { User } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";

import { createSupabaseServerClient } from "@/lib/supabase/server";

import {
  isClearWatchedHistoryConfirmationValid,
  isDeleteAccountConfirmationValid,
  isResetLibraryConfirmationValid,
} from "./confirmation";
import type { ProfileDataControlState } from "./data-control-state";
import {
  clearUserWatchedHistory,
  deleteAuthenticatedUserAccount,
  resetUserLibraryData,
} from "./data-controls";

const CONFIRMATION_MISMATCH_MESSAGE = "Confirmation did not match.";

type SupabaseServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;
type ProfileActionContext =
  | {
      error: ProfileDataControlState;
    }
  | {
      supabase: SupabaseServerClient;
      user: User;
    };

function actionError(message: string): ProfileDataControlState {
  return {
    message,
    status: "error",
  };
}

function actionSuccess(message: string, redirectTo?: string): ProfileDataControlState {
  return {
    message,
    redirectTo,
    status: "success",
  };
}

function revalidateUserDataPages() {
  revalidatePath("/dashboard");
  revalidatePath("/library");
  revalidatePath("/profile");
  revalidatePath("/progress");
  revalidatePath("/search");
}

async function getAuthenticatedActionContext(): Promise<ProfileActionContext> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return {
      error: actionError("Sign in to manage your data."),
    };
  }

  return {
    supabase,
    user,
  };
}

export async function clearWatchedHistoryAction(
  confirmation: unknown,
): Promise<ProfileDataControlState> {
  try {
    const context = await getAuthenticatedActionContext();

    if ("error" in context) {
      return context.error;
    }

    if (!isClearWatchedHistoryConfirmationValid(confirmation)) {
      return actionError(CONFIRMATION_MISMATCH_MESSAGE);
    }

    await clearUserWatchedHistory(context.supabase, context.user.id);
    revalidateUserDataPages();

    return actionSuccess("Watched history cleared.");
  } catch {
    return actionError("Unable to clear watched history right now.");
  }
}

export async function resetLibraryDataAction(confirmation: unknown): Promise<ProfileDataControlState> {
  try {
    const context = await getAuthenticatedActionContext();

    if ("error" in context) {
      return context.error;
    }

    if (!isResetLibraryConfirmationValid(confirmation)) {
      return actionError(CONFIRMATION_MISMATCH_MESSAGE);
    }

    await resetUserLibraryData(context.supabase, context.user.id);
    revalidateUserDataPages();

    return actionSuccess("Library data reset.");
  } catch {
    return actionError("Unable to reset library data right now.");
  }
}

export async function deleteAccountAction(
  _state: ProfileDataControlState,
  formData: FormData,
): Promise<ProfileDataControlState> {
  try {
    const context = await getAuthenticatedActionContext();

    if ("error" in context) {
      return context.error;
    }

    const confirmation = formData.get("deleteConfirmation");

    if (!isDeleteAccountConfirmationValid(confirmation, context.user.email)) {
      return actionError(CONFIRMATION_MISMATCH_MESSAGE);
    }

    await deleteAuthenticatedUserAccount(context.user.id);
    await context.supabase.auth.signOut();
    revalidateUserDataPages();

    return actionSuccess("Account deleted.", "/sign-in");
  } catch {
    return actionError("Unable to delete your account right now.");
  }
}

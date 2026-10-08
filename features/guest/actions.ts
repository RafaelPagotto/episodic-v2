"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { AuthFormState } from "@/features/auth/state";
import { readCaptchaToken } from "@/features/auth/captcha";
import { createSupabaseCookieWriteRequiredServerClient } from "@/lib/supabase/server";
import { initializeGuest, isDemoEnabled } from "./server";

function failure(message: string): AuthFormState {
  console.info("[guest-demo] Request rejected.", { message });
  return { status: "error", message };
}

export async function startGuestDemoAction(_state: AuthFormState, formData: FormData): Promise<AuthFormState> {
  if (!isDemoEnabled()) return failure("The demo is unavailable right now.");
  try {
    const client = await createSupabaseCookieWriteRequiredServerClient();
    const { data: { user: current }, error: currentError } = await client.auth.getUser();
    if (currentError && currentError.name !== "AuthSessionMissingError") return failure("Unable to check your session. Please try again.");
    if (current && !current.is_anonymous) return failure("You are already signed in. Exit your account before trying the demo.");
    let user = current;
    if (!user) {
      const captchaToken = readCaptchaToken(formData);
      if (!captchaToken) return failure("Complete the security check and try again.");
      const { data, error } = await client.auth.signInAnonymously({ options: { captchaToken } });
      if (error || !data.user) return failure("Unable to start the demo. Complete a new security check and try again.");
      user = data.user;
    }
    await initializeGuest(user, formData.get("timeZone"));
    console.info("[guest-demo] Ready.", { resumed: Boolean(current) });
  } catch {
    return failure("Unable to prepare the demo. Please try again or exit the demo session.");
  }
  redirect("/library");
}

export async function resetGuestDemoAction(_state: AuthFormState, formData: FormData): Promise<AuthFormState> {
  if (formData.get("confirmation") !== "RESET DEMO") return failure("Type RESET DEMO to confirm.");
  try {
    const client = await createSupabaseCookieWriteRequiredServerClient();
    const { data: { user }, error } = await client.auth.getUser();
    if (error || !user?.is_anonymous) return failure("An active demo session is required.");
    await initializeGuest(user, null, true);
    console.info("[guest-demo] Reset completed.");
    revalidatePath("/", "layout");
    return { status: "success", message: "Demo restored. Its expiration has not changed." };
  } catch {
    return failure("Unable to reset the demo. Try again shortly.");
  }
}

export async function exitGuestDemoAction(_state: AuthFormState, _formData: FormData): Promise<AuthFormState> {
  void _state;
  void _formData;
  try {
    const client = await createSupabaseCookieWriteRequiredServerClient();
    const { data: { user }, error } = await client.auth.getUser();
    if (error && error.name !== "AuthSessionMissingError") return failure("Unable to exit the demo. Please try again.");
    if (user && !user.is_anonymous) return failure("Use your account sign-out control.");
    const { error: signOutError } = await client.auth.signOut({ scope: "local" });
    if (signOutError) return failure("Unable to exit the demo. Please try again.");
  } catch {
    return failure("Unable to exit the demo. Please try again.");
  }
  redirect("/sign-in");
}

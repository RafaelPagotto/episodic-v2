"use server";

import { redirect } from "next/navigation";

import { createOptionalSupabaseServerClient, createSupabaseServerClient } from "@/lib/supabase/server";

import type { AuthFormState } from "./state";
import {
  readFormString,
  validateDisplayName,
  validateEmail,
  validateNewPassword,
  validateRequiredPassword,
} from "./validation";

function getAppUrl() {
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}

function getAuthCallbackUrl(nextPath: string) {
  const callbackUrl = new URL("/auth/callback", getAppUrl());
  callbackUrl.searchParams.set("next", nextPath);
  return callbackUrl.toString();
}

function authError(message: string, fieldErrors?: Record<string, string>): AuthFormState {
  return {
    status: "error",
    message,
    fieldErrors,
  };
}

function authSuccess(message: string): AuthFormState {
  return {
    status: "success",
    message,
  };
}

async function getConfiguredSupabaseClient() {
  try {
    return await createSupabaseServerClient();
  } catch {
    return null;
  }
}

export async function signInAction(_state: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = readFormString(formData, "email");
  const password = readFormString(formData, "password", { trim: false });
  const fieldErrors: Record<string, string> = {};

  const emailError = validateEmail(email);
  if (emailError) fieldErrors.email = emailError;

  const passwordError = validateRequiredPassword(password);
  if (passwordError) fieldErrors.password = passwordError;

  if (Object.keys(fieldErrors).length > 0) {
    return authError("Check the highlighted fields.", fieldErrors);
  }

  const supabase = await getConfiguredSupabaseClient();
  if (!supabase) {
    return authError("Supabase authentication is not configured yet.");
  }

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return authError(error.message || "Unable to sign in.");
  }

  redirect("/library");
}

export async function signUpAction(_state: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const name = readFormString(formData, "name");
  const email = readFormString(formData, "email");
  const password = readFormString(formData, "password", { trim: false });
  const confirmPassword = readFormString(formData, "confirmPassword", { trim: false });
  const fieldErrors: Record<string, string> = {};

  const nameError = validateDisplayName(name);
  if (nameError) fieldErrors.name = nameError;

  const emailError = validateEmail(email);
  if (emailError) fieldErrors.email = emailError;

  const passwordError = validateNewPassword(password);
  if (passwordError) fieldErrors.password = passwordError;

  if (!confirmPassword) {
    fieldErrors.confirmPassword = "Confirm your password.";
  } else if (password !== confirmPassword) {
    fieldErrors.confirmPassword = "Passwords do not match.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return authError("Check the highlighted fields.", fieldErrors);
  }

  const supabase = await getConfiguredSupabaseClient();
  if (!supabase) {
    return authError("Supabase authentication is not configured yet.");
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        display_name: name,
      },
      emailRedirectTo: getAuthCallbackUrl("/library"),
    },
  });

  if (error) {
    return authError(error.message || "Unable to create account.");
  }

  if (data.session) {
    redirect("/library");
  }

  return authSuccess("Account created. Check your email to confirm your account.");
}

export async function forgotPasswordAction(
  _state: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = readFormString(formData, "email");
  const emailError = validateEmail(email);

  if (emailError) {
    return authError("Check the highlighted fields.", { email: emailError });
  }

  const supabase = await getConfiguredSupabaseClient();
  if (!supabase) {
    return authError("Supabase authentication is not configured yet.");
  }

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: getAuthCallbackUrl("/reset-password"),
  });

  if (error) {
    return authError(error.message || "Unable to send reset link.");
  }

  return authSuccess("Password reset link sent. Check your email.");
}

export async function resetPasswordAction(
  _state: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const password = readFormString(formData, "password", { trim: false });
  const confirmPassword = readFormString(formData, "confirmPassword", { trim: false });
  const fieldErrors: Record<string, string> = {};

  const passwordError = validateNewPassword(password);
  if (passwordError) fieldErrors.password = passwordError;

  if (!confirmPassword) {
    fieldErrors.confirmPassword = "Confirm your password.";
  } else if (password !== confirmPassword) {
    fieldErrors.confirmPassword = "Passwords do not match.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return authError("Check the highlighted fields.", fieldErrors);
  }

  const supabase = await getConfiguredSupabaseClient();
  if (!supabase) {
    return authError("Supabase authentication is not configured yet.");
  }

  const { error } = await supabase.auth.updateUser({
    password,
  });

  if (error) {
    return authError(error.message || "Unable to update password.");
  }

  return authSuccess("Password updated. You can continue to the app.");
}

export async function signOutAction() {
  const supabase = await createOptionalSupabaseServerClient();

  if (supabase) {
    await supabase.auth.signOut();
  }

  redirect("/sign-in");
}

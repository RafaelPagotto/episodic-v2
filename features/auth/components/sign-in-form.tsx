"use client";

import Link from "next/link";
import { useActionState } from "react";

import { signInAction } from "@/features/auth/actions";
import { INITIAL_AUTH_FORM_STATE } from "@/features/auth/state";

import { AuthField } from "./auth-field";
import { AuthFormMessage } from "./auth-form-message";
import { AuthSubmitButton } from "./auth-submit-button";

export function SignInForm() {
  const [state, formAction] = useActionState(signInAction, INITIAL_AUTH_FORM_STATE);

  return (
    <form action={formAction} className="space-y-5">
      <AuthFormMessage state={state} />
      <AuthField
        autoComplete="email"
        error={state.fieldErrors?.email}
        label="Email"
        name="email"
        placeholder="you@example.com"
        type="email"
      />
      <AuthField
        autoComplete="current-password"
        error={state.fieldErrors?.password}
        label="Password"
        name="password"
        type="password"
      />
      <div className="flex justify-end">
        <Link className="text-sm text-muted-foreground hover:text-foreground" href="/forgot-password">
          Forgot password?
        </Link>
      </div>
      <AuthSubmitButton pendingText="Signing in...">Sign in</AuthSubmitButton>
      <p className="text-center text-sm text-muted-foreground">
        New here?{" "}
        <Link className="font-medium text-primary hover:underline" href="/sign-up">
          Create an account
        </Link>
      </p>
    </form>
  );
}

"use client";

import Link from "next/link";
import { useActionState } from "react";

import { forgotPasswordAction } from "@/features/auth/actions";
import { INITIAL_AUTH_FORM_STATE } from "@/features/auth/state";

import { AuthField } from "./auth-field";
import { AuthFormMessage } from "./auth-form-message";
import { AuthSubmitButton } from "./auth-submit-button";

export function ForgotPasswordForm() {
  const [state, formAction] = useActionState(forgotPasswordAction, INITIAL_AUTH_FORM_STATE);

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
      <AuthSubmitButton pendingText="Sending link...">Send reset link</AuthSubmitButton>
      <p className="text-center text-sm text-muted-foreground">
        Remembered it?{" "}
        <Link className="font-medium text-primary hover:underline" href="/sign-in">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}

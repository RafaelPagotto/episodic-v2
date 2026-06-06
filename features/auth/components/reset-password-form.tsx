"use client";

import Link from "next/link";
import { useActionState } from "react";

import { resetPasswordAction } from "@/features/auth/actions";
import { INITIAL_AUTH_FORM_STATE } from "@/features/auth/state";

import { AuthField } from "./auth-field";
import { AuthFormMessage } from "./auth-form-message";
import { AuthSubmitButton } from "./auth-submit-button";

export function ResetPasswordForm() {
  const [state, formAction] = useActionState(resetPasswordAction, INITIAL_AUTH_FORM_STATE);

  return (
    <form action={formAction} className="space-y-5">
      <AuthFormMessage state={state} />
      <AuthField
        autoComplete="new-password"
        error={state.fieldErrors?.password}
        label="New password"
        name="password"
        type="password"
      />
      <AuthField
        autoComplete="new-password"
        error={state.fieldErrors?.confirmPassword}
        label="Confirm new password"
        name="confirmPassword"
        type="password"
      />
      <AuthSubmitButton pendingText="Updating password...">Update password</AuthSubmitButton>
      {state.status === "success" ? (
        <p className="text-center text-sm text-muted-foreground">
          <Link className="font-medium text-primary hover:underline" href="/library">
            Continue to library
          </Link>
        </p>
      ) : null}
    </form>
  );
}

"use client";

import Link from "next/link";
import { useActionState } from "react";

import { signUpAction } from "@/features/auth/actions";
import { INITIAL_AUTH_FORM_STATE } from "@/features/auth/state";

import { AuthField } from "./auth-field";
import { AuthFormMessage } from "./auth-form-message";
import { AuthSubmitButton } from "./auth-submit-button";

export function SignUpForm() {
  const [state, formAction] = useActionState(signUpAction, INITIAL_AUTH_FORM_STATE);

  return (
    <form action={formAction} className="space-y-5">
      <AuthFormMessage state={state} />
      <AuthField
        autoComplete="name"
        error={state.fieldErrors?.name}
        label="Name"
        name="name"
        placeholder="Riley"
        type="text"
      />
      <AuthField
        autoComplete="email"
        error={state.fieldErrors?.email}
        label="Email"
        name="email"
        placeholder="you@example.com"
        type="email"
      />
      <AuthField
        autoComplete="new-password"
        error={state.fieldErrors?.password}
        label="Password"
        name="password"
        type="password"
      />
      <AuthField
        autoComplete="new-password"
        error={state.fieldErrors?.confirmPassword}
        label="Confirm password"
        name="confirmPassword"
        type="password"
      />
      <AuthSubmitButton pendingText="Creating account...">Create account</AuthSubmitButton>
      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link className="font-medium text-primary hover:underline" href="/sign-in">
          Sign in
        </Link>
      </p>
    </form>
  );
}

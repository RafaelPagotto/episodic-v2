"use client";

import { useActionState, useEffect } from "react";
import { AuthField } from "@/features/auth/components/auth-field";
import { AuthFormMessage } from "@/features/auth/components/auth-form-message";
import { AuthSubmitButton } from "@/features/auth/components/auth-submit-button";
import { INITIAL_AUTH_FORM_STATE } from "@/features/auth/state";
import { resetGuestDemoAction, exitGuestDemoAction } from "../actions";

export function GuestControls({ expiresAt, timeZone }: { expiresAt: string; timeZone: string }) {
  const [state, resetAction] = useActionState(resetGuestDemoAction, INITIAL_AUTH_FORM_STATE);
  const [exitState, exitAction] = useActionState(exitGuestDemoAction, INITIAL_AUTH_FORM_STATE);
  useEffect(() => {
    const expires = Date.parse(expiresAt);
    const checkExpiry = () => { if (Date.now() >= expires) window.location.assign("/sign-in"); };
    const timer = window.setTimeout(checkExpiry, Math.max(0, expires - Date.now()));
    document.addEventListener("visibilitychange", checkExpiry);
    return () => { window.clearTimeout(timer); document.removeEventListener("visibilitychange", checkExpiry); };
  }, [expiresAt]);
  const expiry = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone }).format(new Date(expiresAt));
  return (
    <section aria-label="Demo account" className="mb-6 space-y-3 border-b pb-5">
      <p className="text-sm font-medium">Guest demo</p>
      <p className="text-xs text-muted-foreground">Expires <time dateTime={expiresAt}>{expiry}</time> ({timeZone}).</p>
      <details className="max-w-sm">
        <summary className="cursor-pointer text-sm underline focus-visible:outline focus-visible:outline-2">Reset demo</summary>
        <form action={resetAction} className="mt-3 space-y-3">
          <p className="text-sm text-muted-foreground">Replaces your demo library, progress and preferences with the sample data. Timezone and expiration stay unchanged.</p>
          <AuthFormMessage state={state} />
          <AuthField label="Type RESET DEMO to confirm" name="confirmation" autoComplete="off" required />
          <AuthSubmitButton variant="outline" pendingText="Resetting demo...">Reset demo</AuthSubmitButton>
        </form>
      </details>
      <form action={exitAction} className="max-w-sm space-y-3">
        <AuthFormMessage state={exitState} />
        <AuthSubmitButton variant="outline" pendingText="Exiting demo...">Exit demo</AuthSubmitButton>
      </form>
    </section>
  );
}

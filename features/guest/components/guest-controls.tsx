"use client";

import { useActionState, useEffect } from "react";
import { ChevronDown } from "lucide-react";
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
    <section aria-label="Demo account" className="mx-auto mb-4 w-full max-w-6xl border-b pb-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <div className="min-w-0 basis-full sm:basis-0 sm:flex-1">
          <p className="text-sm font-medium">Guest demo</p>
          <p className="text-xs leading-5 text-muted-foreground">Expires <time dateTime={expiresAt}>{expiry}</time> ({timeZone}).</p>
        </div>
        <details className="shrink-0 open:order-last open:basis-full">
          <summary className="text-link inline-flex min-h-11 cursor-pointer list-none items-center gap-1 px-2 text-sm [&::-webkit-details-marker]:hidden">
            Reset demo
            <ChevronDown aria-hidden="true" className="size-3.5" />
          </summary>
          <form action={resetAction} className="mt-2 max-w-md space-y-3 pb-2">
            <p className="text-sm text-muted-foreground">Replaces your demo library, progress and preferences with the sample data. Timezone and expiration stay unchanged.</p>
            <AuthFormMessage state={state} />
            <AuthField label="Type RESET DEMO to confirm" name="confirmation" autoComplete="off" required />
            <AuthSubmitButton variant="outline" pendingText="Resetting demo...">Reset demo</AuthSubmitButton>
          </form>
        </details>
        <form action={exitAction} className="ml-auto shrink-0 sm:ml-0">
          <AuthFormMessage state={exitState} />
          <AuthSubmitButton variant="outline" pendingText="Exiting demo...">Exit demo</AuthSubmitButton>
        </form>
      </div>
    </section>
  );
}

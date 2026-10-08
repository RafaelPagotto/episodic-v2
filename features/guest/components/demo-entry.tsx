"use client";

import { useActionState, useEffect, useState } from "react";
import { AuthFormMessage } from "@/features/auth/components/auth-form-message";
import { AuthSubmitButton } from "@/features/auth/components/auth-submit-button";
import { Turnstile } from "@/features/auth/components/turnstile";
import { INITIAL_AUTH_FORM_STATE } from "@/features/auth/state";
import { startGuestDemoAction, exitGuestDemoAction } from "../actions";

export function DemoEntry({ hasGuestSession = false, enabled = true }: { hasGuestSession?: boolean; enabled?: boolean }) {
  const [state, action] = useActionState(startGuestDemoAction, INITIAL_AUTH_FORM_STATE);
  const [exitState, exitAction] = useActionState(exitGuestDemoAction, INITIAL_AUTH_FORM_STATE);
  const [timeZone, setTimeZone] = useState("");
  useEffect(() => { setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone); }, []);
  return (
    <div className="mt-6 space-y-4 border-t pt-5">
      {enabled ? <form action={action} className="space-y-3">
        <AuthFormMessage state={state} />
        <input name="timeZone" type="hidden" value={timeZone} />
        {!hasGuestSession ? <Turnstile /> : null}
        <AuthSubmitButton variant="outline" pendingText="Preparing demo...">{hasGuestSession ? "Resume demo" : "Try demo"}</AuthSubmitButton>
        <p className="text-center text-xs text-muted-foreground">Demo data expires after 72 hours.</p>
      </form> : null}
      {hasGuestSession ? <form action={exitAction} className="space-y-3">
        <AuthFormMessage state={exitState} />
        <AuthSubmitButton variant="outline" pendingText="Exiting demo...">Exit demo</AuthSubmitButton>
      </form> : null}
    </div>
  );
}

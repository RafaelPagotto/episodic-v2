"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { updatePreferencesAction } from "@/features/preferences/actions";
import { INITIAL_PREFERENCES_FORM_STATE } from "@/features/preferences/state";
import type { UserPreferences } from "@/features/preferences/types";
import { PREFERENCE_ITEMS } from "@/features/preferences/view-model";

type PreferencesFormProps = {
  preferences: UserPreferences;
};

function PreferencesSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button disabled={pending} type="submit">
      {pending ? "Saving..." : "Save preferences"}
    </Button>
  );
}

export function PreferencesForm({ preferences }: PreferencesFormProps) {
  const [state, formAction] = useActionState(updatePreferencesAction, INITIAL_PREFERENCES_FORM_STATE);

  return (
    <form action={formAction} className="space-y-5">
      {state.status !== "idle" ? (
        <Notice tone={state.status === "error" ? "error" : "success"}>{state.message}</Notice>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        {PREFERENCE_ITEMS.map((item) => (
          <label
            key={item.name}
            className="flex min-h-20 items-start gap-3 rounded-md border bg-background p-4 transition hover:bg-secondary/60"
          >
            <input
              className="mt-1 size-4 accent-primary"
              defaultChecked={preferences[item.name]}
              name={item.name}
              type="checkbox"
            />
            <span>
              <span className="block text-sm font-medium">{item.label}</span>
              <span className="mt-1 block text-sm leading-5 text-muted-foreground">{item.description}</span>
            </span>
          </label>
        ))}
      </div>

      <div className="flex justify-end">
        <PreferencesSubmitButton />
      </div>
    </form>
  );
}

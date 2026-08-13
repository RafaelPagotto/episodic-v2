"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  ACTION_FEEDBACK_AUTO_DISMISS_MS,
  ActionFeedback,
} from "@/components/ui/action-feedback";
import { Button } from "@/components/ui/button";
import { DEFAULT_TIME_ZONE } from "../../../lib/date-only";

import { updateUserTimeZoneAction } from "../timezone-actions";
import { INITIAL_TIME_ZONE_ACTION_STATE } from "../timezone-state";

type TimeZoneFormProps = {
  persistedTimeZone: string | null;
};

const COMMON_TIME_ZONES = [
  "UTC",
  "America/Los_Angeles",
  "America/New_York",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Berlin",
  "Asia/Kolkata",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Pacific/Auckland",
];

function TimeZoneSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button disabled={pending} type="submit">
      {pending ? "Saving..." : "Save timezone"}
    </Button>
  );
}

function getSupportedTimeZones() {
  try {
    const supported = Intl.supportedValuesOf("timeZone");
    return Array.from(new Set([DEFAULT_TIME_ZONE, ...supported]));
  } catch {
    return COMMON_TIME_ZONES;
  }
}

export function TimeZoneForm({ persistedTimeZone }: TimeZoneFormProps) {
  const [state, formAction] = useActionState(
    updateUserTimeZoneAction,
    INITIAL_TIME_ZONE_ACTION_STATE,
  );
  const [timeZone, setTimeZone] = useState(persistedTimeZone ?? "");
  const [timeZones, setTimeZones] = useState(COMMON_TIME_ZONES);

  useEffect(() => {
    setTimeZones(getSupportedTimeZones());
  }, []);

  useEffect(() => {
    setTimeZone(persistedTimeZone ?? "");
  }, [persistedTimeZone]);

  return (
    <form action={formAction} className="mt-5 space-y-4">
      {state.status !== "idle" ? (
        <ActionFeedback
          autoDismissMs={state.status === "success" ? ACTION_FEEDBACK_AUTO_DISMISS_MS : undefined}
          dismissible
          feedbackKey={state}
          tone={state.status === "error" ? "error" : "success"}
        >
          {state.message}
        </ActionFeedback>
      ) : null}

      <div className="space-y-2">
        <label className="block text-sm font-medium" htmlFor="profile-time-zone">
          Account timezone
        </label>
        <input
          autoComplete="off"
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:max-w-md"
          id="profile-time-zone"
          list="profile-time-zones"
          name="timeZone"
          onChange={(event) => setTimeZone(event.target.value)}
          placeholder="America/Sao_Paulo"
          required
          value={timeZone}
        />
        <datalist id="profile-time-zones">
          {timeZones.map((option) => (
            <option key={option} value={option} />
          ))}
        </datalist>
        <p className="text-sm text-muted-foreground">
          Used to determine the local date when episodes become available. Current setting: {persistedTimeZone ?? "UTC fallback"}.
        </p>
      </div>

      <div className="flex justify-end">
        <TimeZoneSubmitButton />
      </div>
    </form>
  );
}

"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { normalizeTimeZone } from "../../../lib/date-only";

import { initializeUserTimeZoneAction } from "../timezone-actions";

type TimeZoneInitializerProps = {
  persistedTimeZone: string | null;
};

export function detectBrowserTimeZone() {
  try {
    return normalizeTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  } catch {
    return null;
  }
}

export function TimeZoneInitializer({ persistedTimeZone }: TimeZoneInitializerProps) {
  const attemptedRef = useRef(false);
  const router = useRouter();

  useEffect(() => {
    if (persistedTimeZone || attemptedRef.current) {
      return;
    }

    attemptedRef.current = true;
    const detectedTimeZone = detectBrowserTimeZone();

    if (!detectedTimeZone) {
      return;
    }

    void initializeUserTimeZoneAction(detectedTimeZone).then((result) => {
      if (result.status === "success") {
        router.refresh();
      }
    });
  }, [persistedTimeZone, router]);

  return null;
}

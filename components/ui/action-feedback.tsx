"use client";

import { X } from "lucide-react";
import type { FocusEvent, MouseEvent, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

import { ActionFeedbackTimer } from "./action-feedback-timer";
import { Notice } from "./notice";

export const ACTION_FEEDBACK_AUTO_DISMISS_MS = 5_000;

type ActionFeedbackProps = {
  autoDismissMs?: number;
  children: ReactNode;
  className?: string;
  dismissible?: boolean;
  feedbackKey: unknown;
  presentation?: "inline" | "notice";
  tone: "error" | "success";
};

const NO_DISMISSED_FEEDBACK = Symbol("no-dismissed-action-feedback");

export function ActionFeedback({
  autoDismissMs,
  children,
  className,
  dismissible = false,
  feedbackKey,
  presentation = "notice",
  tone,
}: ActionFeedbackProps) {
  const [dismissedFeedbackKey, setDismissedFeedbackKey] = useState<unknown>(NO_DISMISSED_FEEDBACK);
  const feedbackTimerRef = useRef<ActionFeedbackTimer | null>(null);
  const latestFeedbackKeyRef = useRef(feedbackKey);

  latestFeedbackKeyRef.current = feedbackKey;

  if (feedbackTimerRef.current === null) {
    feedbackTimerRef.current = new ActionFeedbackTimer();
  }

  const isDismissed = Object.is(dismissedFeedbackKey, feedbackKey);

  useEffect(() => {
    const feedbackTimer = feedbackTimerRef.current;

    if (!feedbackTimer) {
      return;
    }

    if (autoDismissMs === undefined || isDismissed) {
      feedbackTimer.clear();
      return;
    }

    const expectedFeedbackKey = feedbackKey;

    feedbackTimer.reset(expectedFeedbackKey, autoDismissMs, () => {
      if (Object.is(latestFeedbackKeyRef.current, expectedFeedbackKey)) {
        setDismissedFeedbackKey(expectedFeedbackKey);
      }
    });
  }, [autoDismissMs, feedbackKey, isDismissed]);

  useEffect(() => {
    const feedbackTimer = feedbackTimerRef.current;

    return () => feedbackTimer?.dispose();
  }, []);

  if (isDismissed) {
    return null;
  }

  function dismiss() {
    feedbackTimerRef.current?.clear();
    setDismissedFeedbackKey(feedbackKey);
  }

  function pauseDismissal() {
    feedbackTimerRef.current?.pause();
  }

  function resumeDismissal(event: FocusEvent<HTMLDivElement> | MouseEvent<HTMLDivElement>) {
    if (
      event.relatedTarget
      && event.currentTarget.contains(event.relatedTarget as Node)
    ) {
      return;
    }

    feedbackTimerRef.current?.resume();
  }

  const content = dismissible ? (
    <div className="flex items-start gap-3">
      <div className="min-w-0 flex-1">{children}</div>
      <button
        aria-label="Dismiss notification"
        className="-m-1 shrink-0 rounded-sm p-1 text-current opacity-70 transition hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={dismiss}
        type="button"
      >
        <X aria-hidden="true" className="size-4" />
      </button>
    </div>
  ) : children;

  return (
    <div
      onBlurCapture={resumeDismissal}
      onFocusCapture={pauseDismissal}
      onMouseEnter={pauseDismissal}
      onMouseLeave={resumeDismissal}
    >
      {presentation === "inline" ? (
        <div
          className={cn(
            "text-sm",
            tone === "error" ? "text-destructive" : "text-primary",
            className,
          )}
          role={tone === "error" ? "alert" : "status"}
        >
          {content}
        </div>
      ) : (
        <Notice className={className} tone={tone}>
          {content}
        </Notice>
      )}
    </div>
  );
}

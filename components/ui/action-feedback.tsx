"use client";

import { X } from "lucide-react";
import type { FocusEvent, MouseEvent, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";

import { ActionFeedbackTimer } from "./action-feedback-timer";
import { acquireActionToastRegion } from "./action-toast-region";
import { Notice } from "./notice";

export const ACTION_FEEDBACK_AUTO_DISMISS_MS = 3_000;

type ActionFeedbackProps = {
  autoDismissMs?: number;
  children: ReactNode;
  className?: string;
  dismissible?: boolean;
  feedbackKey: unknown;
  presentation?: "inline" | "notice" | "toast";
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
  const [toastRegion, setToastRegion] = useState<HTMLDivElement | null>(null);
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

  useEffect(() => {
    if (presentation !== "toast" || isDismissed) return;
    const acquired = acquireActionToastRegion();
    setToastRegion(acquired.element);
    return acquired.release;
  }, [presentation, isDismissed]);

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
        className={cn(
          "shrink-0 rounded-sm text-current opacity-70 transition hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          presentation === "toast" ? "-my-2 -mr-2 flex size-11 items-center justify-center" : "-m-1 p-1",
        )}
        onClick={dismiss}
        type="button"
      >
        <X aria-hidden="true" className="size-4" />
      </button>
    </div>
  ) : children;

  const feedback = (
    <div
      className={presentation === "toast" ? "pointer-events-auto w-full max-w-md shrink-0" : undefined}
      onBlurCapture={resumeDismissal}
      onFocusCapture={pauseDismissal}
      onMouseEnter={pauseDismissal}
      onMouseLeave={resumeDismissal}
    >
      {presentation === "toast" ? (
        <div
          aria-atomic="true"
          className={cn(
            "pointer-events-auto w-full max-w-md rounded-lg border bg-card/85 px-4 py-3 text-sm leading-6 text-card-foreground shadow-xl backdrop-blur-md",
            tone === "error" ? "border-destructive/50" : "border-primary/40",
            className,
          )}
          role={tone === "error" ? "alert" : "status"}
        >
          {content}
        </div>
      ) : presentation === "inline" ? (
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

  // Escape layout containment on Dashboard and take no space in the page's flow.
  return presentation === "toast" ? (toastRegion ? createPortal(feedback, toastRegion) : null) : feedback;
}

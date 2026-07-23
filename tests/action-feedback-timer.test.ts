import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ActionFeedbackTimer,
  type ActionFeedbackTimerScheduler,
} from "../components/ui/action-feedback-timer";

describe("ActionFeedbackTimer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("dismisses successful feedback after five seconds", () => {
    const onDismiss = vi.fn();
    const timer = new ActionFeedbackTimer();

    timer.reset("success", 5_000, onDismiss);
    vi.advanceTimersByTime(4_999);
    expect(onDismiss).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("resets the delay when feedback is replaced", () => {
    const firstDismiss = vi.fn();
    const secondDismiss = vi.fn();
    const timer = new ActionFeedbackTimer();

    timer.reset("first", 5_000, firstDismiss);
    vi.advanceTimersByTime(4_000);
    timer.reset("second", 5_000, secondDismiss);
    vi.advanceTimersByTime(1_000);

    expect(firstDismiss).not.toHaveBeenCalled();
    expect(secondDismiss).not.toHaveBeenCalled();

    vi.advanceTimersByTime(4_000);
    expect(secondDismiss).toHaveBeenCalledTimes(1);
  });

  it("prevents an older queued timer from dismissing newer feedback", () => {
    const callbacks: Array<() => void> = [];
    const scheduler: ActionFeedbackTimerScheduler = {
      clearTimeout: vi.fn(),
      now: () => 0,
      setTimeout: (callback) => {
        callbacks.push(callback);
        return callbacks.length as unknown as ReturnType<typeof globalThis.setTimeout>;
      },
    };
    const firstDismiss = vi.fn();
    const secondDismiss = vi.fn();
    const timer = new ActionFeedbackTimer(scheduler);

    timer.reset("first", 5_000, firstDismiss);
    timer.reset("second", 5_000, secondDismiss);
    callbacks[0]();

    expect(firstDismiss).not.toHaveBeenCalled();
    expect(secondDismiss).not.toHaveBeenCalled();

    callbacks[1]();
    expect(secondDismiss).toHaveBeenCalledTimes(1);
  });

  it("pauses and resumes with the remaining delay", () => {
    const onDismiss = vi.fn();
    const timer = new ActionFeedbackTimer();

    timer.reset("interactive", 5_000, onDismiss);
    vi.advanceTimersByTime(2_000);
    timer.pause();
    vi.advanceTimersByTime(10_000);
    expect(onDismiss).not.toHaveBeenCalled();

    timer.resume();
    vi.advanceTimersByTime(2_999);
    expect(onDismiss).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("clears its pending timer when disposed", () => {
    const onDismiss = vi.fn();
    const timer = new ActionFeedbackTimer();

    timer.reset("unmount", 5_000, onDismiss);
    timer.dispose();
    vi.advanceTimersByTime(5_000);

    expect(onDismiss).not.toHaveBeenCalled();
  });
});

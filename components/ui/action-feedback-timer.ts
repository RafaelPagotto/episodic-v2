type TimerHandle = ReturnType<typeof globalThis.setTimeout>;

export type ActionFeedbackTimerScheduler = {
  clearTimeout: (handle: TimerHandle) => void;
  now: () => number;
  setTimeout: (callback: () => void, delayMs: number) => TimerHandle;
};

const DEFAULT_TIMER_SCHEDULER: ActionFeedbackTimerScheduler = {
  clearTimeout: (handle) => globalThis.clearTimeout(handle),
  now: () => Date.now(),
  setTimeout: (callback, delayMs) => globalThis.setTimeout(callback, delayMs),
};

export class ActionFeedbackTimer {
  private currentKey: unknown;
  private generation = 0;
  private onDismiss: (() => void) | null = null;
  private remainingMs = 0;
  private readonly scheduler: ActionFeedbackTimerScheduler;
  private startedAt = 0;
  private timerHandle: TimerHandle | null = null;

  constructor(scheduler: ActionFeedbackTimerScheduler = DEFAULT_TIMER_SCHEDULER) {
    this.scheduler = scheduler;
  }

  clear() {
    this.generation += 1;

    if (this.timerHandle !== null) {
      this.scheduler.clearTimeout(this.timerHandle);
      this.timerHandle = null;
    }

    this.currentKey = undefined;
    this.onDismiss = null;
    this.remainingMs = 0;
  }

  dispose() {
    this.clear();
  }

  pause() {
    if (this.timerHandle === null) {
      return;
    }

    this.scheduler.clearTimeout(this.timerHandle);
    this.timerHandle = null;
    this.remainingMs = Math.max(0, this.remainingMs - (this.scheduler.now() - this.startedAt));
    this.generation += 1;
  }

  reset(key: unknown, delayMs: number, onDismiss: () => void) {
    this.clear();

    if (!Number.isFinite(delayMs) || delayMs <= 0) {
      return;
    }

    this.currentKey = key;
    this.onDismiss = onDismiss;
    this.remainingMs = delayMs;
    this.schedule();
  }

  resume() {
    if (this.timerHandle !== null || this.onDismiss === null || this.remainingMs <= 0) {
      return;
    }

    this.schedule();
  }

  private schedule() {
    const expectedGeneration = this.generation;
    const expectedKey = this.currentKey;

    this.startedAt = this.scheduler.now();
    this.timerHandle = this.scheduler.setTimeout(() => {
      if (
        expectedGeneration !== this.generation
        || !Object.is(expectedKey, this.currentKey)
        || this.onDismiss === null
      ) {
        return;
      }

      const onDismiss = this.onDismiss;
      this.timerHandle = null;
      this.remainingMs = 0;
      onDismiss();
    }, this.remainingMs);
  }
}

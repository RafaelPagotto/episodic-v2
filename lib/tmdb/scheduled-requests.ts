import "server-only";

import { TmdbClientError } from "./errors";

const WRITE_HEADROOM_MS = 20_000;
const REQUEST_TIMEOUT_MS = 15_000;

export type TmdbRequestControl = ReturnType<typeof createScheduledTmdbRequestControl>;

export function createScheduledTmdbRequestControl(deadlineMs: number) {
  let cooldownUntil = 0;
  let nextStartAt = 0;
  let startGate = Promise.resolve();
  let requests = 0;
  let retries = 0;

  function checkTime(headroomMs = WRITE_HEADROOM_MS) {
    if (Date.now() + headroomMs >= deadlineMs) {
      throw new Error("Metadata refresh time budget exhausted.");
    }
  }

  async function run<T>(operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      // Serialize admission, not responses; five season requests may remain in flight.
      const ready = startGate.then(async () => {
        while (Math.max(cooldownUntil, nextStartAt) > Date.now()) {
          const delay = Math.max(cooldownUntil, nextStartAt) - Date.now();
          checkTime(WRITE_HEADROOM_MS + delay);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
        checkTime();
        nextStartAt = Date.now() + 100;
      });
      startGate = ready.catch(() => undefined);
      await ready;
      checkTime();
      const signal = AbortSignal.timeout(Math.min(REQUEST_TIMEOUT_MS, deadlineMs - Date.now() - WRITE_HEADROOM_MS));
      requests++;
      try {
        return await operation(signal);
      } catch (error) {
        if (!(error instanceof TmdbClientError) || error.code !== "TMDB_RATE_LIMITED") throw error;
        const header = error.retryAfter;
        const delay = header && /^\d+(\.\d+)?$/.test(header)
          ? Number(header) * 1000
          : header ? Date.parse(header) - Date.now() : 1000;
        cooldownUntil = Math.max(cooldownUntil, Date.now() + Math.max(1000, Number.isFinite(delay) ? delay : 1000));
        if (attempt >= 1) throw error;
        checkTime(WRITE_HEADROOM_MS + cooldownUntil - Date.now());
        retries++;
      }
    }
  }

  function databaseSignal() {
    checkTime(0);
    return AbortSignal.timeout(Math.min(10_000, deadlineMs - Date.now()));
  }

  return { run, checkTime, databaseSignal, metrics: () => ({ requests, retries }) };
}

import "server-only";

type TmdbRateLimitScope = "add-show" | "details" | "refresh-show" | "search";

type RateLimitConfig = {
  limit: number;
  windowMs: number;
};

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

type RateLimitState = {
  entries: Map<string, RateLimitEntry>;
  lastSweepAt: number;
};

export type TmdbRateLimitResult = {
  allowed: boolean;
  retryAfterSeconds: number;
};

const RATE_LIMIT_SWEEP_INTERVAL_MS = 60_000;
const TMDB_RATE_LIMITS: Record<TmdbRateLimitScope, RateLimitConfig> = {
  "add-show": { limit: 10, windowMs: 60_000 },
  details: { limit: 10, windowMs: 60_000 },
  "refresh-show": { limit: 5, windowMs: 60_000 },
  search: { limit: 30, windowMs: 60_000 },
};

const globalForTmdbRateLimit = globalThis as typeof globalThis & {
  episodicTmdbRateLimitState?: RateLimitState;
};

const rateLimitState =
  globalForTmdbRateLimit.episodicTmdbRateLimitState ??
  {
    entries: new Map<string, RateLimitEntry>(),
    lastSweepAt: Date.now(),
  };

globalForTmdbRateLimit.episodicTmdbRateLimitState = rateLimitState;

function sweepExpiredEntries(now: number) {
  if (now - rateLimitState.lastSweepAt < RATE_LIMIT_SWEEP_INTERVAL_MS) {
    return;
  }

  for (const [key, entry] of rateLimitState.entries) {
    if (entry.resetAt <= now) {
      rateLimitState.entries.delete(key);
    }
  }

  rateLimitState.lastSweepAt = now;
}

export function consumeTmdbRateLimit(
  scope: TmdbRateLimitScope,
  userId: string,
): TmdbRateLimitResult {
  const now = Date.now();
  const config = TMDB_RATE_LIMITS[scope];
  const key = `${scope}:${userId}`;

  sweepExpiredEntries(now);

  const existingEntry = rateLimitState.entries.get(key);

  if (!existingEntry || existingEntry.resetAt <= now) {
    rateLimitState.entries.set(key, {
      count: 1,
      resetAt: now + config.windowMs,
    });

    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (existingEntry.count >= config.limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((existingEntry.resetAt - now) / 1_000)),
    };
  }

  existingEntry.count += 1;

  return { allowed: true, retryAfterSeconds: 0 };
}

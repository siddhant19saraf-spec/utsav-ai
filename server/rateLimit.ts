export interface RateLimitDecision {
  readonly allowed: boolean;
  readonly remaining: number;
  readonly retryAfterSeconds: number;
}

export interface RateLimiter {
  check(key: string): RateLimitDecision;
}

export interface RateLimiterOptions {
  readonly maxRequests: number;
  readonly windowMs: number;
  readonly now?: () => number;
}

interface WindowState {
  count: number;
  resetAt: number;
}

/**
 * Small fixed-window limiter for the API. It is intentionally in-memory:
 * there is no shared store or multi-process coordination, and the goal is to
 * stop accidental or abusive bursts rather than to provide billing quotas.
 */
export function createRateLimiter(options: RateLimiterOptions): RateLimiter {
  const now = options.now ?? Date.now;
  const windows = new Map<string, WindowState>();

  return {
    check(key: string): RateLimitDecision {
      const currentTime = now();
      let state = windows.get(key);

      if (!state || currentTime >= state.resetAt) {
        state = { count: 0, resetAt: currentTime + options.windowMs };
        windows.set(key, state);
      }

      if (state.count >= options.maxRequests) {
        return {
          allowed: false,
          remaining: 0,
          retryAfterSeconds: Math.max(
            1,
            Math.ceil((state.resetAt - currentTime) / 1_000),
          ),
        };
      }

      state.count += 1;

      if (windows.size > 1_000) {
        for (const [entryKey, entry] of windows) {
          if (currentTime >= entry.resetAt) {
            windows.delete(entryKey);
          }
        }
      }

      return {
        allowed: true,
        remaining: Math.max(0, options.maxRequests - state.count),
        retryAfterSeconds: 0,
      };
    },
  };
}

import { describe, expect, it } from 'vitest';
import { createRateLimiter } from './rateLimit.ts';

describe('fixed-window rate limiter', () => {
  it('allows the configured burst and then rejects with a retry delay', () => {
    const currentTime = 1_000;
    const limiter = createRateLimiter({
      maxRequests: 2,
      windowMs: 60_000,
      now: () => currentTime,
    });

    expect(limiter.check('client-a')).toMatchObject({
      allowed: true,
      remaining: 1,
    });
    expect(limiter.check('client-a')).toMatchObject({
      allowed: true,
      remaining: 0,
    });
    expect(limiter.check('client-a')).toEqual({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 60,
    });
  });

  it('resets after the window and isolates different clients', () => {
    let currentTime = 0;
    const limiter = createRateLimiter({
      maxRequests: 1,
      windowMs: 1_000,
      now: () => currentTime,
    });

    expect(limiter.check('client-a').allowed).toBe(true);
    expect(limiter.check('client-a').allowed).toBe(false);
    expect(limiter.check('client-b').allowed).toBe(true);

    currentTime = 1_001;
    expect(limiter.check('client-a').allowed).toBe(true);
  });
});

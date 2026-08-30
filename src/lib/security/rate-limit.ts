/**
 * Rate limiting is per process instance. On Vercel this is not a global
 * cluster quota — each isolate has its own window. The RateLimiter
 * interface exists so a distributed store can replace InMemoryRateLimiter
 * without changing call sites that depend on consumeAiRateLimit /
 * consumeCaptureGrantRateLimit.
 */

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export interface RateLimitPolicy {
  limit: number;
  windowMs: number;
}

export interface RateLimiter {
  consume(key: string, policy: RateLimitPolicy): Promise<RateLimitResult>;
}

export interface SlidingWindowLimiter {
  consume: (key: string, at?: number) => RateLimitResult;
  reset: () => void;
}

export interface SlidingWindowLimiterOptions {
  limit: number;
  windowMs: number;
  now?: () => number;
  store?: Map<string, number[]>;
}

export const RATE_LIMITS = {
  captureGrant: { limit: 30, windowMs: 60_000 },
  aiActions: { limit: 20, windowMs: 60_000 },
} as const satisfies Record<string, RateLimitPolicy>;

export const AI_RATE_LIMIT_MESSAGE =
  "Muitas solicitações de IA neste minuto. Aguarde e tente novamente.";

export function createSlidingWindowLimiter(
  options: SlidingWindowLimiterOptions,
): SlidingWindowLimiter {
  const store = options.store ?? new Map<string, number[]>();
  const nowFn = options.now ?? Date.now;

  return {
    consume(key, at) {
      const now = at ?? nowFn();
      const windowStart = now - options.windowMs;
      const recent = (store.get(key) ?? []).filter((timestamp) => timestamp > windowStart);

      if (recent.length >= options.limit) {
        store.set(key, recent);
        const oldest = recent[0] ?? now;
        const retryAfterMs = Math.max(0, oldest + options.windowMs - now);
        return {
          allowed: false,
          remaining: 0,
          retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)),
        };
      }

      recent.push(now);
      store.set(key, recent);
      return {
        allowed: true,
        remaining: options.limit - recent.length,
        retryAfterSeconds: 0,
      };
    },
    reset() {
      store.clear();
    },
  };
}

/**
 * In-process limiter. Not shared across Vercel instances. Swap this
 * singleton via `setRateLimiter` when a Redis/edge store is introduced.
 */
export class InMemoryRateLimiter implements RateLimiter {
  private readonly buckets = new Map<string, SlidingWindowLimiter>();

  constructor(private readonly now: () => number = Date.now) {}

  consumeNow(key: string, policy: RateLimitPolicy): RateLimitResult {
    const bucketId = `${policy.limit}:${policy.windowMs}`;
    let limiter = this.buckets.get(bucketId);
    if (!limiter) {
      limiter = createSlidingWindowLimiter({
        limit: policy.limit,
        windowMs: policy.windowMs,
        now: this.now,
      });
      this.buckets.set(bucketId, limiter);
    }
    return limiter.consume(key);
  }

  consume(key: string, policy: RateLimitPolicy): Promise<RateLimitResult> {
    return Promise.resolve(this.consumeNow(key, policy));
  }

  reset(): void {
    this.buckets.clear();
  }
}

let activeRateLimiter: InMemoryRateLimiter = new InMemoryRateLimiter();

export function getRateLimiter(): RateLimiter {
  return activeRateLimiter;
}

/** Test helper — not a public runtime API. */
export function setRateLimiterForTests(limiter: InMemoryRateLimiter): void {
  activeRateLimiter = limiter;
}

export const captureGrantLimiter = createSlidingWindowLimiter(RATE_LIMITS.captureGrant);
export const aiActionLimiter = createSlidingWindowLimiter(RATE_LIMITS.aiActions);

export function clientIpFromHeaders(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) {
      return first;
    }
  }

  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp) {
    return realIp;
  }

  return "unknown";
}

export function consumeCaptureGrantRateLimit(ip: string): RateLimitResult {
  return activeRateLimiter.consumeNow(`capture-grant:${ip}`, RATE_LIMITS.captureGrant);
}

export function consumeAiRateLimit(organizationId: string, userId: string): RateLimitResult {
  return activeRateLimiter.consumeNow(`ai:${organizationId}:${userId}`, RATE_LIMITS.aiActions);
}

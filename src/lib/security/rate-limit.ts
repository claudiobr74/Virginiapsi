/**
 * Best-effort in-memory sliding window. On Vercel this is per-instance, not a
 * global cluster limit — document that honestly in the release gate. Do not
 * treat this as a substitute for an edge/WAF quota.
 */

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
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
} as const;

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
  return captureGrantLimiter.consume(`capture-grant:${ip}`);
}

export function consumeAiRateLimit(organizationId: string, userId: string): RateLimitResult {
  return aiActionLimiter.consume(`ai:${organizationId}:${userId}`);
}

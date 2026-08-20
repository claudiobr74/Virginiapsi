import { describe, expect, it } from "vitest";
import {
  clientIpFromHeaders,
  createSlidingWindowLimiter,
  RATE_LIMITS,
} from "@/lib/security/rate-limit";

describe("sliding window rate limiter", () => {
  it("aceita até o limite e recusa o excedente na mesma janela", () => {
    let now = 1_000_000;
    const limiter = createSlidingWindowLimiter({
      limit: 3,
      windowMs: 60_000,
      now: () => now,
    });

    expect(limiter.consume("a").allowed).toBe(true);
    expect(limiter.consume("a").allowed).toBe(true);
    expect(limiter.consume("a").remaining).toBe(0);
    const denied = limiter.consume("a");
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("isola chaves e reabre a janela quando o timestamp mais antigo sai", () => {
    let now = 1_000_000;
    const limiter = createSlidingWindowLimiter({
      limit: 1,
      windowMs: 1_000,
      now: () => now,
    });

    expect(limiter.consume("org-a").allowed).toBe(true);
    expect(limiter.consume("org-b").allowed).toBe(true);
    expect(limiter.consume("org-a").allowed).toBe(false);

    now += 1_001;
    expect(limiter.consume("org-a").allowed).toBe(true);
  });

  it("exporta os tetos canônicos de grant e IA", () => {
    expect(RATE_LIMITS.captureGrant).toEqual({ limit: 30, windowMs: 60_000 });
    expect(RATE_LIMITS.aiActions).toEqual({ limit: 20, windowMs: 60_000 });
  });

  it("lê o primeiro IP de x-forwarded-for e cai para unknown", () => {
    expect(
      clientIpFromHeaders(new Headers({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" })),
    ).toBe("203.0.113.9");
    expect(clientIpFromHeaders(new Headers({ "x-real-ip": "198.51.100.2" }))).toBe(
      "198.51.100.2",
    );
    expect(clientIpFromHeaders(new Headers())).toBe("unknown");
  });
});

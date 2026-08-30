import { describe, expect, it } from "vitest";
import { buildContentSecurityPolicy } from "@/lib/security/csp";

describe("Content-Security-Policy", () => {
  it("usa nonce e não libera script-src *", () => {
    const csp = buildContentSecurityPolicy({
      nonce: "abc123",
      supabaseOrigin: "https://example.supabase.co",
      isDev: false,
    });
    expect(csp).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic' 'wasm-unsafe-eval'");
    expect(csp).not.toMatch(/script-src\s+\*/);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("https://example.supabase.co");
    expect(csp).toContain("wss://example.supabase.co");
    expect(csp).not.toContain("'unsafe-eval'");
  });

  it("em desenvolvimento permite eval do Next.js", () => {
    const csp = buildContentSecurityPolicy({
      nonce: "dev",
      supabaseOrigin: "http://127.0.0.1:54321",
      isDev: true,
    });
    expect(csp).toContain("'unsafe-eval'");
    expect(csp).toContain("ws://127.0.0.1:54321");
  });
});

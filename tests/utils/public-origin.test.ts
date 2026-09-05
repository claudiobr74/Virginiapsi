import { describe, expect, it } from "vitest";
import { resolvePublicAuthOrigin } from "@/features/auth/public-origin";

describe("resolvePublicAuthOrigin", () => {
  it("usa x-forwarded-host quando o request.url é o host de deploy", () => {
    const result = resolvePublicAuthOrigin({
      url: "https://virginiapsi-4ms01cksf-claudiobr74-9668s-projects.vercel.app/auth/callback?code=secret",
      headers: {
        get(name: string) {
          if (name === "x-forwarded-host") {
            return "virginiapsi-git-cursor-transc-137826-claudiobr74-9668s-projects.vercel.app";
          }
          if (name === "x-forwarded-proto") {
            return "https";
          }
          return null;
        },
      },
    });
    expect(result.origin).toBe(
      "https://virginiapsi-git-cursor-transc-137826-claudiobr74-9668s-projects.vercel.app",
    );
    expect(result.hostMismatch).toBe(true);
    expect(result.hostname).toBe("virginiapsi-4ms01cksf-claudiobr74-9668s-projects.vercel.app");
  });

  it("não trata host mismatch quando os hostnames coincidem", () => {
    const result = resolvePublicAuthOrigin({
      url: "https://preview.example/auth/callback",
      headers: {
        get(name: string) {
          if (name === "x-forwarded-host") {
            return "preview.example";
          }
          return null;
        },
      },
    });
    expect(result.hostMismatch).toBe(false);
    expect(result.origin).toBe("https://preview.example");
  });
});

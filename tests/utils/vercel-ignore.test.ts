import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

const script = path.resolve(__dirname, "../../scripts/vercel-ignore.mjs");

function ignoreExit(env: Record<string, string>) {
  return spawnSync(process.execPath, [script], {
    env: { ...process.env, ...env },
    encoding: "utf8",
  }).status;
}

describe("vercel-ignore", () => {
  it("não ignora Production mesmo em branch go-live", () => {
    expect(
      ignoreExit({
        VERCEL_ENV: "production",
        VERCEL_GIT_COMMIT_REF: "cursor/go-live-g3-staging-prep-dcad",
      }),
    ).toBe(1);
  });

  it("ignora Preview de G0/G2/G3/G4 (não compartilhar Postgres de produção)", () => {
    expect(
      ignoreExit({
        VERCEL_ENV: "preview",
        VERCEL_GIT_COMMIT_REF: "cursor/go-live-g0-inventory-dcad",
      }),
    ).toBe(0);
    expect(
      ignoreExit({
        VERCEL_ENV: "preview",
        VERCEL_GIT_COMMIT_REF: "cursor/go-live-g2-identity-dcad",
      }),
    ).toBe(0);
    expect(
      ignoreExit({
        VERCEL_ENV: "preview",
        VERCEL_GIT_COMMIT_REF: "cursor/go-live-g3-staging-prep-dcad",
      }),
    ).toBe(0);
    expect(
      ignoreExit({
        VERCEL_ENV: "preview",
        VERCEL_GIT_COMMIT_REF: "cursor/go-live-g4-production-dcad",
      }),
    ).toBe(0);
  });

  it("permite Preview de G1 visual", () => {
    expect(
      ignoreExit({
        VERCEL_ENV: "preview",
        VERCEL_GIT_COMMIT_REF: "cursor/go-live-g1-visual-dcad",
      }),
    ).toBe(1);
  });
});

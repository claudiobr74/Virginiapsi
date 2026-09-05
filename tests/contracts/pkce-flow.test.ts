import { describe, expect, it } from "vitest";
import {
  cookieListHasPkceVerifier,
  isPkceVerifierCookieName,
  listPkceVerifierCookieNames,
  readPkceFlowId,
  readPkceFlowIdFromCookies,
  resolvePkceFlowId,
} from "@/features/auth/pkce-flow";

const FLOW_A = "0123456789abcdef0123456789abcdef";
const FLOW_B = "fedcba9876543210fedcba9876543210";
const PREFIX = "sb-project-auth-token";

function flowCookie(flowId: string, chunk = "") {
  return { name: `${PREFIX}-flow-${flowId}-code-verifier${chunk}` };
}

describe("PKCE flow recovery", () => {
  it("accepts the same flow-id alphabet/length used by auth-js", () => {
    expect(readPkceFlowId("abcdEFGH_123-xyz")).toBe("abcdEFGH_123-xyz");
    expect(readPkceFlowId("short")).toBeUndefined();
    expect(readPkceFlowId("a".repeat(65))).toBeUndefined();
    expect(readPkceFlowId("abcdefgh%20")).toBeUndefined();
  });

  it("recognizes legacy, per-flow and chunked verifier cookies without touching session cookies", () => {
    expect(isPkceVerifierCookieName(`${PREFIX}-code-verifier`)).toBe(true);
    expect(isPkceVerifierCookieName(`${PREFIX}-flow-${FLOW_A}-code-verifier`)).toBe(true);
    expect(isPkceVerifierCookieName(`${PREFIX}-flow-${FLOW_A}-code-verifier.0`)).toBe(true);
    expect(isPkceVerifierCookieName(`${PREFIX}`)).toBe(false);
    expect(cookieListHasPkceVerifier([{ name: PREFIX }, flowCookie(FLOW_A)])).toBe(true);
  });

  it("recovers the sole per-flow verifier when sb_flow_id was stripped", () => {
    const cookies = [
      { name: PREFIX },
      { name: `${PREFIX}-code-verifier` },
      flowCookie(FLOW_A),
    ];
    expect(readPkceFlowIdFromCookies(cookies)).toBe(FLOW_A);
    expect(resolvePkceFlowId(null, cookies)).toBe(FLOW_A);
  });

  it("never guesses between two pending PKCE flows", () => {
    expect(readPkceFlowIdFromCookies([flowCookie(FLOW_A), flowCookie(FLOW_B)])).toBeUndefined();
  });

  it("prefers an explicit valid sb_flow_id over cookie recovery", () => {
    expect(resolvePkceFlowId(FLOW_B, [flowCookie(FLOW_A)])).toBe(FLOW_B);
  });

  it("lists only stale verifier cookies for fresh-login cleanup", () => {
    const header = [
      `${PREFIX}=session-value`,
      `${PREFIX}-code-verifier=legacy`,
      `${PREFIX}-flow-${FLOW_A}-code-verifier=current`,
      `${PREFIX}-flow-${FLOW_A}-code-verifier.0=chunk`,
      "other=value",
    ].join("; ");

    expect(listPkceVerifierCookieNames(header)).toEqual([
      `${PREFIX}-code-verifier`,
      `${PREFIX}-flow-${FLOW_A}-code-verifier`,
      `${PREFIX}-flow-${FLOW_A}-code-verifier.0`,
    ]);
  });
});

// Pure, parameter-based signing helpers (same shape as
// src/lib/integrations/google/oauth.ts's state signing), which keeps them
// unit-testable without the "server-only" guard. The module that actually
// reads SESSION_CAPTURE_SECRET from the environment and issues grants over
// HTTP is src/lib/consent/capability-gate.ts.
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

export interface CaptureGrantPayload {
  organizationId: string;
  patientId: string;
  sessionId: string;
  capability:
    | "session_capture_grant"
    | "session_remote_transcription_grant"
    | "audio_fallback_upload_grant";
  nonce: string;
  issuedAt: number;
  expiresAt: number;
}

/**
 * TTL covers a typical clinical session (~60 min) plus delayed recovery
 * after reconnect without requiring a new consent gate mid-session.
 * Audio still never leaves the browser until a granted live chunk is posted;
 * the grant is not a Groq credential. Re-issue is always possible via /grant.
 */
export const CAPTURE_GRANT_TTL_MS = 4 * 60 * 60 * 1000;

export function signCaptureGrant(
  payload: Omit<CaptureGrantPayload, "nonce" | "issuedAt" | "expiresAt">,
  secret: string,
  now: number = Date.now(),
): string {
  const fullPayload: CaptureGrantPayload = {
    ...payload,
    nonce: randomUUID(),
    issuedAt: now,
    expiresAt: now + CAPTURE_GRANT_TTL_MS,
  };
  const encodedPayload = Buffer.from(JSON.stringify(fullPayload), "utf8").toString(
    "base64url",
  );
  const signature = createHmac("sha256", secret).update(encodedPayload).digest("base64url");
  return `${encodedPayload}.${signature}`;
}

export interface VerifyCaptureGrantResult {
  valid: boolean;
  payload?: CaptureGrantPayload;
  reason?: "malformed" | "signature_mismatch" | "expired" | "scope_mismatch";
}

export interface VerifyCaptureGrantExpectedScope {
  organizationId: string;
  sessionId: string;
  capability: CaptureGrantPayload["capability"];
}

export function verifyCaptureGrant(
  token: string,
  secret: string,
  expectedScope: VerifyCaptureGrantExpectedScope,
  now: number = Date.now(),
): VerifyCaptureGrantResult {
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) {
    return { valid: false, reason: "malformed" };
  }

  const expectedSignature = createHmac("sha256", secret)
    .update(encodedPayload)
    .digest("base64url");

  const provided = Buffer.from(signature);
  const expected = Buffer.from(expectedSignature);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return { valid: false, reason: "signature_mismatch" };
  }

  let payload: CaptureGrantPayload;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
  } catch {
    return { valid: false, reason: "malformed" };
  }

  if (now > payload.expiresAt) {
    return { valid: false, reason: "expired" };
  }

  if (
    payload.organizationId !== expectedScope.organizationId ||
    payload.sessionId !== expectedScope.sessionId ||
    payload.capability !== expectedScope.capability
  ) {
    return { valid: false, reason: "scope_mismatch" };
  }

  return { valid: true, payload };
}

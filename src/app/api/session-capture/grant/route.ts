import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  authorizeCaptureCapability,
  issueCaptureGrant,
} from "@/lib/consent/capability-gate";
import { CAPTURE_GRANT_TTL_MS } from "@/lib/consent/capture-grant";
import {
  clientIpFromHeaders,
  consumeCaptureGrantRateLimit,
} from "@/lib/security/rate-limit";
import { BODY_LIMIT_BYTES, readLimitedJson } from "@/lib/security/request-limits";
import {
  invalidJsonResponse,
  payloadTooLargeResponse,
  tooManyRequestsResponse,
} from "@/lib/security/http-responses";

const bodySchema = z.object({
  patientId: z.string().uuid(),
  sessionId: z.string().uuid(),
});

/**
 * Session capture grant — authorizes activating the microphone for on-device
 * transcription (docs/22-transcription-provider-decision.md). The browser
 * requests this once per active session, before loading the local
 * transcription model, and includes the token on every transcript-segment
 * persistence call.
 */
export async function POST(request: NextRequest) {
  const ip = clientIpFromHeaders(request.headers);
  const rate = consumeCaptureGrantRateLimit(ip);
  if (!rate.allowed) {
    return tooManyRequestsResponse(rate.retryAfterSeconds);
  }

  const limited = await readLimitedJson(request, BODY_LIMIT_BYTES.jsonCapture);
  if (!limited.ok) {
    return limited.status === 413 ? payloadTooLargeResponse() : invalidJsonResponse();
  }

  const parsed = bodySchema.safeParse(limited.value);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const gate = await authorizeCaptureCapability(
    parsed.data.patientId,
    parsed.data.sessionId,
    "session_capture_grant",
  );

  if (!gate.allowed) {
    return NextResponse.json(
      { error: gate.reason, message: gate.message },
      { status: gate.status },
    );
  }

  const token = issueCaptureGrant(gate, "session_capture_grant");
  return NextResponse.json({
    grant: token,
    expiresInMs: CAPTURE_GRANT_TTL_MS,
  });
}

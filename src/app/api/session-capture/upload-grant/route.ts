import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { authorizeCaptureCapability } from "@/lib/consent/capability-gate";
import { createFallbackUploadGrant } from "@/lib/integrations/transcription/fallback-storage";
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
 * Signed upload grant for the optional audio fallback. It runs the *same*
 * consent gate as the on-device capture grant — `session-audio-fallback` must
 * never accept an upload authorized only by membership
 * (docs/05-security-rbac-rls.md §Áudio/transcrição).
 *
 * This path only exists for organizations that explicitly enable the
 * fallback; with it disabled the session proceeds without transcription
 * rather than shipping clinical audio out.
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
    "audio_fallback_upload_grant",
  );

  if (!gate.allowed) {
    return NextResponse.json(
      { error: gate.reason, message: gate.message },
      { status: gate.status },
    );
  }

  try {
    const grant = await createFallbackUploadGrant(gate.organizationId, gate.sessionId);
    return NextResponse.json(grant);
  } catch {
    return NextResponse.json(
      { error: "upload_grant_failed", message: "Não foi possível preparar o upload agora." },
      { status: 500 },
    );
  }
}

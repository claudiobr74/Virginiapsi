import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { authorizeCaptureCapability, issueCaptureGrant } from "@/lib/consent/capability-gate";
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
  filename: z.string().trim().max(180).optional(),
});

/**
 * Signed upload grant for importing an external recording. Live capture
 * never uses this bucket — only the import path does.
 *
 * `session-audio-fallback` must never accept an upload authorized only by
 * membership (docs/05-security-rbac-rls.md §Áudio/transcrição).
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
    const upload = await createFallbackUploadGrant(gate.organizationId, gate.sessionId, {
      filename: parsed.data.filename,
    });
    const grant = issueCaptureGrant(gate, "audio_fallback_upload_grant");
    return NextResponse.json({
      grant,
      bucket: upload.bucket,
      path: upload.path,
      token: upload.token,
      signedUrl: upload.signedUrl,
    });
  } catch {
    return NextResponse.json(
      { error: "upload_grant_failed", message: "Não foi possível preparar o upload agora." },
      { status: 500 },
    );
  }
}

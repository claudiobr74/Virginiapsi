import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  authorizeCaptureCapability,
  issueCaptureGrant,
} from "@/lib/consent/capability-gate";
import { CAPTURE_GRANT_TTL_MS } from "@/lib/consent/capture-grant";

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
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
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

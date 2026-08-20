import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { authorizeCaptureCapability } from "@/lib/consent/capability-gate";

const bodySchema = z.object({ patientId: z.string().uuid() });

/**
 * Signed upload grant for the optional audio fallback. It runs the *same*
 * consent gate as the on-device capture grant — `session-audio-fallback` must
 * never accept an upload authorized only by membership
 * (docs/05-security-rbac-rls.md §Áudio/transcrição).
 *
 * This path only exists for organizations that explicitly enable the fallback;
 * with it disabled the session proceeds without transcription rather than
 * shipping clinical audio out. Phase 5.5 delivers the denial path; minting the
 * signed grant against Storage is Phase 6.
 */
export async function POST(request: NextRequest) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const gate = await authorizeCaptureCapability(
    parsed.data.patientId,
    "audio_fallback_upload_grant",
  );

  if (!gate.allowed) {
    return NextResponse.json(
      { error: gate.reason, message: gate.message },
      { status: gate.status },
    );
  }

  return NextResponse.json(
    {
      error: "capability_pending_phase_6",
      message:
        "Consentimento válido. A emissão do signed upload grant é implementada na Fase 6.",
    },
    { status: 501 },
  );
}

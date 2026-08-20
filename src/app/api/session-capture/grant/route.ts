import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { authorizeCaptureCapability } from "@/lib/consent/capability-gate";

const bodySchema = z.object({ patientId: z.string().uuid() });

/**
 * Session capture grant — authorizes activating the microphone for on-device
 * transcription (docs/22-transcription-provider-decision.md).
 *
 * Phase 5.5 delivers the *gate*: no capture is authorized without a valid
 * recording + transcription ConsentState. Issuing the signed, short-lived
 * grant (and the persistence check that rejects transcript segments without
 * it) is Phase 6 — until then the allowed branch reports 501 rather than
 * handing out a grant that nothing yet verifies.
 */
export async function POST(request: NextRequest) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const gate = await authorizeCaptureCapability(
    parsed.data.patientId,
    "session_capture_grant",
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
        "Consentimento válido. A emissão do grant de captura é implementada na Fase 6.",
    },
    { status: 501 },
  );
}

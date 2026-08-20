import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { authorizeCaptureCapability } from "@/lib/consent/capability-gate";

const bodySchema = z.object({ patientId: z.string().uuid() });

/**
 * Deepgram temporary token endpoint. Phase 5.5 delivers the *gate*: no token
 * is ever issued without a valid recording + transcription ConsentState, and
 * Deepgram is not contacted at all on the denial path. Minting the real
 * short-lived token (30s TTL, fresh on every connection/reconnect) is Phase 6
 * — until then the allowed branch reports 501 instead of returning a
 * fabricated credential.
 */
export async function POST(request: NextRequest) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const gate = await authorizeCaptureCapability(
    parsed.data.patientId,
    "deepgram_live_token",
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
        "Consentimento válido. A emissão do token temporário Deepgram é implementada na Fase 6.",
    },
    { status: 501 },
  );
}

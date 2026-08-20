import { NextResponse, type NextRequest } from "next/server";
import { transcriptSegmentInputSchema } from "@/features/sessions/contracts";
import { verifyCaptureGrantToken } from "@/lib/consent/capability-gate";
import { requireOrgContext } from "@/lib/auth/require-org-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Persists one final transcript segment. This is the real server-side
 * enforcement point of the local transcription path
 * (docs/22-transcription-provider-decision.md §5): the server never sees the
 * on-device audio, so it refuses to persist a segment whose grant does not
 * verify for this exact organization/session — regardless of which
 * capability (`session_capture_grant` or the fallback's) issued it, since
 * both authorize writing to this session's transcript.
 */
export async function POST(request: NextRequest) {
  const parsed = transcriptSegmentInputSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const { organizationId, role } = await requireOrgContext();
  if (role !== "psychologist_admin") {
    return NextResponse.json({ error: "forbidden_role" }, { status: 403 });
  }

  const grantForCapture = verifyCaptureGrantToken(parsed.data.grant, {
    organizationId,
    sessionId: parsed.data.sessionId,
    capability: "session_capture_grant",
  });
  const grantForFallback = verifyCaptureGrantToken(parsed.data.grant, {
    organizationId,
    sessionId: parsed.data.sessionId,
    capability: "audio_fallback_upload_grant",
  });

  if (!grantForCapture.valid && !grantForFallback.valid) {
    return NextResponse.json(
      { error: grantForCapture.reason ?? "invalid_grant" },
      { status: 403 },
    );
  }

  if (grantForCapture.payload?.patientId !== parsed.data.patientId &&
      grantForFallback.payload?.patientId !== parsed.data.patientId) {
    return NextResponse.json({ error: "scope_mismatch" }, { status: 403 });
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("session_transcript_segments").insert({
    session_id: parsed.data.sessionId,
    organization_id: organizationId,
    sequence: parsed.data.sequence,
    text: parsed.data.text,
    is_final: parsed.data.isFinal,
    start_ms: parsed.data.startMs ?? null,
    end_ms: parsed.data.endMs ?? null,
    provider: parsed.data.provider,
    provider_confidence: parsed.data.providerConfidence ?? null,
    ambiguity_flags: parsed.data.ambiguityFlags ?? null,
  });

  if (error) {
    // A duplicate (session_id, sequence) is expected on resume/retry — the
    // segment is already persisted, so this is a success from the caller's
    // point of view, not a failure to surface.
    if (error.code === "23505") {
      return NextResponse.json({ ok: true, duplicate: true });
    }
    return NextResponse.json({ error: "persist_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

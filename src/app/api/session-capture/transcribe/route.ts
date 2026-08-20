import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { verifyCaptureGrantToken } from "@/lib/consent/capability-gate";
import { requireOrgContext } from "@/lib/auth/require-org-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getServerEnv } from "@/lib/env/server";
import { GroqTranscriptionClient } from "@/lib/integrations/transcription/groq-client";
import { FALLBACK_AUDIO_BUCKET } from "@/lib/integrations/transcription/fallback-storage";
import { BODY_LIMIT_BYTES, readLimitedJson } from "@/lib/security/request-limits";
import { invalidJsonResponse, payloadTooLargeResponse } from "@/lib/security/http-responses";

const bodySchema = z.object({
  grant: z.string().min(1),
  sessionId: z.string().uuid(),
  patientId: z.string().uuid(),
  storagePath: z.string().min(1),
  sequence: z.number().int().nonnegative(),
  startMs: z.number().int().nonnegative(),
});

/**
 * Server-side batch transcription for the optional Groq fallback: the
 * browser already uploaded the audio directly to Storage via the signed
 * upload grant, so this endpoint only downloads it (service-role, same
 * bucket with zero direct grants), sends it to Groq, and persists the
 * result as a normal transcript segment. It runs the *same* grant
 * verification as the local-path persistence endpoint — a fallback upload
 * grant authorizes transcribing that one object, nothing else.
 */
export async function POST(request: NextRequest) {
  const limited = await readLimitedJson(request, BODY_LIMIT_BYTES.jsonTranscribeMetadata);
  if (!limited.ok) {
    return limited.status === 413 ? payloadTooLargeResponse() : invalidJsonResponse();
  }

  const parsed = bodySchema.safeParse(limited.value);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const { organizationId, role } = await requireOrgContext();
  if (role !== "psychologist_admin") {
    return NextResponse.json({ error: "forbidden_role" }, { status: 403 });
  }

  const grant = verifyCaptureGrantToken(parsed.data.grant, {
    organizationId,
    sessionId: parsed.data.sessionId,
    capability: "audio_fallback_upload_grant",
  });
  if (!grant.valid || grant.payload?.patientId !== parsed.data.patientId) {
    return NextResponse.json({ error: grant.reason ?? "invalid_grant" }, { status: 403 });
  }
  if (!parsed.data.storagePath.startsWith(`${organizationId}/${parsed.data.sessionId}/`)) {
    return NextResponse.json({ error: "scope_mismatch" }, { status: 403 });
  }

  const env = getServerEnv();
  if (!env.GROQ_API_KEY) {
    return NextResponse.json(
      { error: "fallback_not_configured", message: "Fallback de transcrição não habilitado." },
      { status: 400 },
    );
  }

  const admin = createSupabaseAdminClient();
  const { data: audioFile, error: downloadError } = await admin.storage
    .from(FALLBACK_AUDIO_BUCKET)
    .download(parsed.data.storagePath);

  if (downloadError || !audioFile) {
    return NextResponse.json({ error: "download_failed" }, { status: 500 });
  }

  const arrayBuffer = await audioFile.arrayBuffer();
  const sha256 = createHash("sha256").update(Buffer.from(arrayBuffer)).digest("hex");

  const groq = new GroqTranscriptionClient({ apiKey: env.GROQ_API_KEY });
  let transcription;
  try {
    transcription = await groq.transcribe(audioFile, "session-audio.webm", { language: "pt" });
  } catch {
    return NextResponse.json({ error: "transcription_failed" }, { status: 502 });
  }

  const text = transcription.text?.trim();
  const durationMs = Math.round((transcription.duration ?? 0) * 1000);
  const supabase = await createSupabaseServerClient();

  await supabase.from("session_transcript_artifacts").insert({
    session_id: parsed.data.sessionId,
    organization_id: organizationId,
    storage_path: parsed.data.storagePath,
    sha256,
    provider: "groq-batch",
    duration_seconds: transcription.duration ?? null,
    language: transcription.language ?? "pt",
  });

  if (!text) {
    return NextResponse.json({ ok: true, text: "" });
  }

  const { error: insertError } = await supabase.from("session_transcript_segments").insert({
    session_id: parsed.data.sessionId,
    organization_id: organizationId,
    sequence: parsed.data.sequence,
    text,
    is_final: true,
    start_ms: parsed.data.startMs,
    end_ms: parsed.data.startMs + durationMs,
    provider: "groq-batch",
  });

  if (insertError && insertError.code !== "23505") {
    return NextResponse.json({ error: "persist_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, text });
}

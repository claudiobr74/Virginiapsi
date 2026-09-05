import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { verifyCaptureGrantToken } from "@/lib/consent/capability-gate";
import { isClinicalPractitioner } from "@/features/organizations/roles";
import { requireOrgContext } from "@/lib/auth/require-org-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createGroqTranscriptionClient } from "@/lib/integrations/transcription/create-groq-client";
import { GroqApiError } from "@/lib/integrations/transcription/groq-client";
import {
  deleteImportedAudioObject,
  FALLBACK_AUDIO_BUCKET,
} from "@/lib/integrations/transcription/fallback-storage";
import {
  extensionFromFilename,
  filenameForAudioMime,
  isGroqSupportedAudioMime,
} from "@/lib/integrations/transcription/groq-audio";
import { IMPORT_AUDIO_MAX_BYTES } from "@/features/sessions/transcription/constants";
import { BODY_LIMIT_BYTES, readLimitedJson } from "@/lib/security/request-limits";
import { invalidJsonResponse, payloadTooLargeResponse } from "@/lib/security/http-responses";

export const runtime = "nodejs";
export const maxDuration = 120;

const bodySchema = z.object({
  grant: z.string().min(1),
  sessionId: z.string().uuid(),
  patientId: z.string().uuid(),
  storagePath: z.string().min(1),
  sequence: z.number().int().nonnegative(),
  startMs: z.number().int().nonnegative(),
  filename: z.string().trim().max(180).optional(),
});

/**
 * External recording import: the browser uploaded audio to private Storage
 * via a consent-gated signed URL. This route downloads it (service-role),
 * sends it to Groq, persists the transcript, then deletes the temporary
 * object. Live capture never uses this path.
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
  if (!isClinicalPractitioner(role)) {
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

  let groq;
  try {
    groq = createGroqTranscriptionClient();
  } catch {
    return NextResponse.json(
      {
        error: "transcription_not_configured",
        message: "A transcrição não está configurada neste ambiente.",
      },
      { status: 503 },
    );
  }

  const admin = createSupabaseAdminClient();
  const { data: audioFile, error: downloadError } = await admin.storage
    .from(FALLBACK_AUDIO_BUCKET)
    .download(parsed.data.storagePath);

  if (downloadError || !audioFile) {
    return NextResponse.json({ error: "download_failed" }, { status: 500 });
  }

  if (audioFile.size > IMPORT_AUDIO_MAX_BYTES) {
    return payloadTooLargeResponse();
  }

  const mimeType = audioFile.type || "application/octet-stream";
  const filename =
    parsed.data.filename && extensionFromFilename(parsed.data.filename)
      ? parsed.data.filename
      : filenameForAudioMime(isGroqSupportedAudioMime(mimeType) ? mimeType : "audio/webm");

  const arrayBuffer = await audioFile.arrayBuffer();
  const sha256 = createHash("sha256").update(Buffer.from(arrayBuffer)).digest("hex");

  let transcription;
  try {
    transcription = await groq.transcribe(audioFile, filename, { language: "pt", temperature: 0 });
  } catch (error) {
    const status = error instanceof GroqApiError && error.status === 429 ? 429 : 502;
    return NextResponse.json({ error: "transcription_failed" }, { status });
  }

  const text = transcription.text?.trim() ?? "";
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
    await deleteImportedAudioObject(parsed.data.storagePath);
    return NextResponse.json({
      ok: true,
      already_processed: false,
      segment: null,
    });
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

  await deleteImportedAudioObject(parsed.data.storagePath);

  return NextResponse.json({
    ok: true,
    already_processed: insertError?.code === "23505",
    segment: {
      sequence: parsed.data.sequence,
      text,
      startMs: parsed.data.startMs,
      endMs: parsed.data.startMs + durationMs,
      provider: "groq-batch",
    },
  });
}

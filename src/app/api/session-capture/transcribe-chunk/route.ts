import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { verifyCaptureGrantToken } from "@/lib/consent/capability-gate";
import { isClinicalPractitioner } from "@/features/organizations/roles";
import { requireOrgContext } from "@/lib/auth/require-org-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createGroqTranscriptionClient } from "@/lib/integrations/transcription/create-groq-client";
import {
  filenameForAudioMime,
  isGroqSupportedAudioMime,
} from "@/lib/integrations/transcription/groq-audio";
import { GroqApiError } from "@/lib/integrations/transcription/groq-client";
import {
  consumeTranscribeChunkRateLimit,
} from "@/lib/security/rate-limit";
import { BODY_LIMIT_BYTES, contentLengthExceeds } from "@/lib/security/request-limits";
import {
  payloadTooLargeResponse,
  tooManyRequestsResponse,
} from "@/lib/security/http-responses";
import { LIVE_CHUNK_MAX_BYTES } from "@/features/sessions/transcription/constants";

export const runtime = "nodejs";
export const maxDuration = 60;

const fieldsSchema = z.object({
  grant: z.string().min(1),
  patientId: z.string().uuid(),
  sessionId: z.string().uuid(),
  chunkId: z.string().uuid(),
  sequence: z.coerce.number().int().nonnegative(),
  startMs: z.coerce.number().int().nonnegative(),
  endMs: z.coerce.number().int().nonnegative(),
});

type SegmentAck = {
  sequence: number;
  text: string;
  startMs: number;
  endMs: number;
  provider: "groq-batch";
};

function logChunkEvent(fields: Record<string, string | number | boolean | null>) {
  console.info(JSON.stringify({ level: "info", route: "/api/session-capture/transcribe-chunk", ...fields }));
}

async function loadExistingSegment(
  sessionId: string,
  sequence: number,
): Promise<SegmentAck | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("session_transcript_segments")
    .select("sequence, text, start_ms, end_ms, provider")
    .eq("session_id", sessionId)
    .eq("sequence", sequence)
    .maybeSingle();

  if (!data) {
    return null;
  }

  return {
    sequence: data.sequence as number,
    text: data.text as string,
    startMs: (data.start_ms as number | null) ?? 0,
    endMs: (data.end_ms as number | null) ?? 0,
    provider: "groq-batch",
  };
}

function ackResponse(segment: SegmentAck | null, alreadyProcessed: boolean) {
  return NextResponse.json({
    ok: true,
    already_processed: alreadyProcessed,
    segment,
  });
}

/**
 * Live Groq path: browser sends one independently-decodable audio chunk.
 * Audio is held in request memory, sent to Groq, persisted as text, then
 * discarded. It never enters Supabase Storage on this route.
 */
export async function POST(request: NextRequest) {
  if (contentLengthExceeds(request.headers, BODY_LIMIT_BYTES.multipartAudioChunk)) {
    return payloadTooLargeResponse();
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const parsed = fieldsSchema.safeParse({
    grant: form.get("grant"),
    patientId: form.get("patientId"),
    sessionId: form.get("sessionId"),
    chunkId: form.get("chunkId"),
    sequence: form.get("sequence"),
    startMs: form.get("startMs"),
    endMs: form.get("endMs"),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const audio = form.get("audio");
  if (!(audio instanceof Blob) || audio.size === 0) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  if (audio.size > LIVE_CHUNK_MAX_BYTES) {
    return payloadTooLargeResponse();
  }

  const mimeType = audio.type || "application/octet-stream";
  if (!isGroqSupportedAudioMime(mimeType)) {
    return NextResponse.json({ error: "unsupported_audio_type" }, { status: 415 });
  }

  const { organizationId, role } = await requireOrgContext();
  if (!isClinicalPractitioner(role)) {
    return NextResponse.json({ error: "forbidden_role" }, { status: 403 });
  }

  const grant = verifyCaptureGrantToken(parsed.data.grant, {
    organizationId,
    sessionId: parsed.data.sessionId,
    capability: "session_capture_grant",
  });
  if (!grant.valid || grant.payload?.patientId !== parsed.data.patientId) {
    return NextResponse.json({ error: grant.reason ?? "invalid_grant" }, { status: 403 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: sessionRow } = await supabase
    .from("clinical_sessions")
    .select("id, patient_id, organization_id")
    .eq("id", parsed.data.sessionId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!sessionRow || (sessionRow as { patient_id: string }).patient_id !== parsed.data.patientId) {
    return NextResponse.json({ error: "scope_mismatch" }, { status: 403 });
  }

  const rate = consumeTranscribeChunkRateLimit(organizationId, parsed.data.sessionId);
  if (!rate.allowed) {
    return tooManyRequestsResponse(rate.retryAfterSeconds);
  }

  const existing = await loadExistingSegment(parsed.data.sessionId, parsed.data.sequence);
  if (existing) {
    logChunkEvent({
      event: "already_processed",
      sequence: parsed.data.sequence,
      mime: mimeType.split(";")[0] ?? mimeType,
      chunkBytes: audio.size,
    });
    return ackResponse(existing, true);
  }

  let groq;
  try {
    groq = createGroqTranscriptionClient();
  } catch {
    return NextResponse.json(
      {
        error: "transcription_not_configured",
        message: "A transcrição em tempo real não está configurada neste ambiente.",
      },
      { status: 503 },
    );
  }

  const started = Date.now();
  let transcription;
  try {
    transcription = await groq.transcribe(audio, filenameForAudioMime(mimeType), {
      language: "pt",
      temperature: 0,
    });
  } catch (error) {
    const status = error instanceof GroqApiError ? error.status : 502;
    logChunkEvent({
      event: "groq_failed",
      status,
      mime: mimeType.split(";")[0] ?? mimeType,
      chunkBytes: audio.size,
      latencyMs: Date.now() - started,
    });
    if (error instanceof GroqApiError && error.status === 429) {
      return tooManyRequestsResponse(2);
    }
    return NextResponse.json(
      { error: "transcription_failed" },
      { status: status === 408 ? 504 : 502 },
    );
  }

  const text = transcription.text.trim();
  if (!text) {
    logChunkEvent({
      event: "empty_transcript",
      sequence: parsed.data.sequence,
      mime: mimeType.split(";")[0] ?? mimeType,
      chunkBytes: audio.size,
      latencyMs: Date.now() - started,
    });
    return ackResponse(null, false);
  }

  const { error: insertError } = await supabase.from("session_transcript_segments").insert({
    session_id: parsed.data.sessionId,
    organization_id: organizationId,
    sequence: parsed.data.sequence,
    text,
    is_final: true,
    start_ms: parsed.data.startMs,
    end_ms: parsed.data.endMs,
    provider: "groq-batch",
  });

  if (insertError?.code === "23505") {
    const duplicate = await loadExistingSegment(parsed.data.sessionId, parsed.data.sequence);
    return ackResponse(duplicate, true);
  }
  if (insertError) {
    return NextResponse.json({ error: "persist_failed" }, { status: 500 });
  }

  logChunkEvent({
    event: "persisted",
    sequence: parsed.data.sequence,
    mime: mimeType.split(";")[0] ?? mimeType,
    chunkBytes: audio.size,
    latencyMs: Date.now() - started,
  });

  return ackResponse(
    {
      sequence: parsed.data.sequence,
      text,
      startMs: parsed.data.startMs,
      endMs: parsed.data.endMs,
      provider: "groq-batch",
    },
    false,
  );
}

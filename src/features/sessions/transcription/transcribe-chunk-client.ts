import type { AudioChunk } from "@/features/sessions/transcription/audio-chunk";

export type TranscribeChunkAck = {
  ok: true;
  already_processed: boolean;
  segment: {
    sequence: number;
    text: string;
    startMs: number;
    endMs: number;
    provider: "groq-batch";
  } | null;
};

export type TranscribeChunkFailure = {
  ok: false;
  retryable: boolean;
  status: number;
  error: string;
};

export type TranscribeChunkResult = TranscribeChunkAck | TranscribeChunkFailure;

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status === 502 || status === 503 || status === 504 || status >= 500;
}

export async function sendTranscriptionChunk(
  chunk: AudioChunk,
  grant: string,
  patientId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<TranscribeChunkResult> {
  const form = new FormData();
  form.append("grant", grant);
  form.append("patientId", patientId);
  form.append("sessionId", chunk.sessionId);
  form.append("chunkId", chunk.chunkId);
  form.append("sequence", String(chunk.sequence));
  form.append("startMs", String(chunk.startMs));
  form.append("endMs", String(chunk.endMs));
  form.append("audio", chunk.blob, "chunk");

  let response: Response;
  try {
    response = await fetchImpl("/api/session-capture/transcribe-chunk", {
      method: "POST",
      body: form,
    });
  } catch {
    return { ok: false, retryable: true, status: 0, error: "network_error" };
  }

  if (!response.ok) {
    return {
      ok: false,
      retryable: isRetryableStatus(response.status),
      status: response.status,
      error: `http_${response.status}`,
    };
  }

  try {
    const body = (await response.json()) as TranscribeChunkAck;
    if (!body.ok) {
      return { ok: false, retryable: false, status: response.status, error: "invalid_ack" };
    }
    return {
      ok: true,
      already_processed: body.already_processed === true,
      segment: body.segment ?? null,
    };
  } catch {
    return { ok: false, retryable: true, status: response.status, error: "invalid_ack" };
  }
}

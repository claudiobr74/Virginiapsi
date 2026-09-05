import { describe, expect, it, vi } from "vitest";
import { sendTranscriptionChunk } from "@/features/sessions/transcription/transcribe-chunk-client";
import type { AudioChunk } from "@/features/sessions/transcription/audio-chunk";

describe("sendTranscriptionChunk", () => {
  it("envia o áudio só para a API do VirgíniaPsi, nunca ao Groq no browser", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      expect(url).toBe("/api/session-capture/transcribe-chunk");
      expect(url).not.toContain("groq.com");
      return new Response(
        JSON.stringify({
          ok: true,
          already_processed: false,
          segment: { sequence: 0, text: "ok", startMs: 0, endMs: 1, provider: "groq-batch" },
        }),
        { status: 200 },
      );
    });

    const chunk: AudioChunk = {
      chunkId: "11111111-1111-4111-8111-111111111111",
      sequence: 0,
      sessionId: "33333333-3333-4333-8333-333333333333",
      organizationId: "44444444-4444-4444-8444-444444444444",
      blob: new Blob([new Uint8Array([1])], { type: "audio/webm" }),
      mimeType: "audio/webm",
      startMs: 0,
      endMs: 15000,
      createdAt: Date.now(),
      retryCount: 0,
      state: "sending",
    };

    const result = await sendTranscriptionChunk(
      chunk,
      "grant",
      "22222222-2222-4222-8222-222222222222",
      fetchImpl as unknown as typeof fetch,
    );
    expect(result.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

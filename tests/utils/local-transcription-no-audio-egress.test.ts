import { renderHook, act, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLocalTranscription } from "@/features/sessions/transcription/use-local-transcription";

// This is the regression test docs/08-implementation-phases.md Fase 6
// requires: "teste que falha se qualquer requisição carregar áudio para
// fora do dispositivo". It drives the *real* hook end to end (grant →
// device/model selection → mic capture → chunk → transcribe → persist),
// with only the browser/ML boundaries mocked (MediaRecorder/AudioContext
// don't exist in jsdom; the actual ONNX/WebGPU pipeline needs a real
// browser/model download, already validated by the spike in
// docs/23-transcription-spike-results.md) — every `fetch` call the hook
// makes is captured and asserted to carry only text, never the audio itself.

const capturedOnChunk: Array<(blob: Blob) => void> = [];

vi.mock("@/features/sessions/transcription/chunked-mic-capture", () => ({
  ChunkedMicCapture: vi.fn().mockImplementation((options: { onChunk: (blob: Blob) => void }) => {
    capturedOnChunk.push(options.onChunk);
    return { start: vi.fn(), stop: vi.fn() };
  }),
}));

vi.mock("@/features/sessions/transcription/local-pipeline", () => ({
  loadLocalTranscriber: vi.fn().mockResolvedValue(
    vi.fn().mockResolvedValue({ text: "Trecho transcrito no dispositivo." }),
  ),
}));

vi.mock("@/features/sessions/transcription/device-capability", () => ({
  detectTranscriptionDevice: vi.fn().mockResolvedValue("webgpu"),
}));

const fetchCalls: { url: string; body: unknown }[] = [];

function mockFetch() {
  return vi.fn(async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(init.body as string) : null;
    fetchCalls.push({ url, body });

    if (url === "/api/session-capture/grant") {
      return new Response(JSON.stringify({ grant: "fake-grant.sig", expiresInMs: 1000 }), {
        status: 200,
      });
    }
    if (url === "/api/session-capture/segment") {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    throw new Error(`unexpected fetch to ${url}`);
  });
}

class FakeAudioContext {
  async decodeAudioData(_buffer: ArrayBuffer) {
    return {
      numberOfChannels: 1,
      duration: 1.5,
      sampleRate: 16000,
      getChannelData: () => new Float32Array(100).fill(0.1),
    };
  }
  async close() {}
}

describe("useLocalTranscription — nenhum áudio sai do dispositivo", () => {
  beforeEach(() => {
    fetchCalls.length = 0;
    capturedOnChunk.length = 0;
    vi.stubGlobal("fetch", mockFetch());
    vi.stubGlobal("AudioContext", FakeAudioContext);
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getUserMedia: vi.fn().mockResolvedValue({
          getTracks: () => [{ stop: vi.fn() }],
        }),
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("todo fetch feito durante a captura só carrega texto, nunca o áudio do chunk", async () => {
    const onSegment = vi.fn();
    const { result } = renderHook(() =>
      useLocalTranscription({
        sessionId: "11111111-1111-4111-8111-111111111111",
        patientId: "22222222-2222-4222-8222-222222222222",
        onSegment,
      }),
    );

    await act(async () => {
      await result.current.start();
    });

    await waitFor(() => expect(result.current.state).toBe("recording"));
    expect(capturedOnChunk).toHaveLength(1);

    // Simulates a finalized mic-capture chunk (would be raw audio bytes in
    // production) being handed to the hook's internal chunk processor.
    // jsdom's Blob polyfill doesn't implement arrayBuffer(); stub it on the
    // instance rather than relying on jsdom parity for something browsers
    // have supported for years.
    const fakeAudioBlob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: "audio/webm" });
    (fakeAudioBlob as Blob & { arrayBuffer: () => Promise<ArrayBuffer> }).arrayBuffer = async () =>
      new ArrayBuffer(8);
    await act(async () => {
      capturedOnChunk[0](fakeAudioBlob);
    });

    await waitFor(() => expect(onSegment).toHaveBeenCalledTimes(1));

    expect(fetchCalls.length).toBeGreaterThan(0);
    for (const call of fetchCalls) {
      // Every request this hook ever makes targets our own API, never a
      // transcription provider or any third-party endpoint with the audio.
      expect(call.url.startsWith("/api/session-capture/")).toBe(true);

      const serialized = JSON.stringify(call.body);
      // The audio blob is a binary object; JSON.stringify on any object
      // containing it would either drop it silently or throw — asserting
      // the body round-trips to plain JSON with only expected string/number
      // fields proves no binary payload is smuggled in.
      expect(serialized).not.toContain("[object Blob]");
      expect(serialized).not.toMatch(/audio\/webm/);
    }

    const segmentCall = fetchCalls.find((call) => call.url === "/api/session-capture/segment");
    expect(segmentCall).toBeDefined();
    const segmentBody = segmentCall!.body as Record<string, unknown>;
    expect(segmentBody.text).toBe("Trecho transcrito no dispositivo.");
    expect(Object.keys(segmentBody).sort()).toEqual(
      [
        "endMs",
        "grant",
        "isFinal",
        "patientId",
        "provider",
        "sequence",
        "sessionId",
        "startMs",
        "text",
      ].sort(),
    );
  });
});

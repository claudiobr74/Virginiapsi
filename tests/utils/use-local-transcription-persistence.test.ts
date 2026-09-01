import { renderHook, act, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLocalTranscription } from "@/features/sessions/transcription/use-local-transcription";
import { SEGMENT_PERSISTENCE_WARNING } from "@/features/sessions/transcription/persist-session-segment";
import { CAPTURE_GRANT_FALLBACK_MESSAGE } from "@/features/sessions/transcription/grant-error-message";

const capturedOnChunk: Array<(blob: Blob) => void> = [];
const closeAudioContext = vi.fn(async () => undefined);

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
let segmentHandler: (callIndex: number) => Promise<Response> | Response;
let grantHandler: () => Promise<Response> | Response;
const getUserMedia = vi.fn();

function mockFetch() {
  return vi.fn(async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(init.body as string) : null;
    fetchCalls.push({ url, body });

    if (url === "/api/session-capture/grant") {
      return grantHandler();
    }
    if (url === "/api/session-capture/segment") {
      const segmentCalls = fetchCalls.filter((call) => call.url === "/api/session-capture/segment");
      return segmentHandler(segmentCalls.length);
    }
    throw new Error(`unexpected fetch to ${url}`);
  });
}

class FakeAudioContext {
  state = "running";
  resume = vi.fn(async () => {
    this.state = "running";
  });
  async decodeAudioData() {
    return {
      numberOfChannels: 1,
      duration: 1.5,
      sampleRate: 16000,
      getChannelData: () => new Float32Array(100).fill(0.1),
    };
  }
  close = closeAudioContext;
}

const sessionId = "11111111-1111-4111-8111-111111111111";
const patientId = "22222222-2222-4222-8222-222222222222";

function audioBlob(): Blob {
  const fakeAudioBlob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: "audio/webm" });
  (fakeAudioBlob as Blob & { arrayBuffer: () => Promise<ArrayBuffer> }).arrayBuffer = async () =>
    new ArrayBuffer(8);
  return fakeAudioBlob;
}

async function startRecording() {
  const onSegment = vi.fn();
  const { result } = renderHook(() =>
    useLocalTranscription({
      sessionId,
      patientId,
      onSegment,
    }),
  );

  await act(async () => {
    await result.current.start();
  });

  await waitFor(() => expect(result.current.state).toBe("recording"));
  return { result, onSegment };
}

describe("useLocalTranscription — persistência e erros do grant", () => {
  beforeEach(() => {
    fetchCalls.length = 0;
    capturedOnChunk.length = 0;
    closeAudioContext.mockClear();
    getUserMedia.mockReset();
    getUserMedia.mockResolvedValue({
      getTracks: () => [{ stop: vi.fn() }],
    });
    grantHandler = () =>
      new Response(JSON.stringify({ grant: "fake-grant.sig", expiresInMs: 1000 }), { status: 200 });
    segmentHandler = async () => new Response(JSON.stringify({ ok: true }), { status: 200 });
    vi.stubGlobal("fetch", mockFetch());
    vi.stubGlobal("AudioContext", FakeAudioContext);
    vi.stubGlobal("navigator", {
      mediaDevices: { getUserMedia },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("não chama onSegment quando o servidor recusa persistir com 500, e avisa sem parar a captura", async () => {
    segmentHandler = async () =>
      new Response(JSON.stringify({ error: "persist_failed" }), { status: 500 });

    const { result, onSegment } = await startRecording();
    expect(capturedOnChunk).toHaveLength(1);

    await act(async () => {
      capturedOnChunk[0](audioBlob());
    });

    await waitFor(() => expect(result.current.segmentWarning).toBe(SEGMENT_PERSISTENCE_WARNING));
    expect(onSegment).not.toHaveBeenCalled();
    expect(result.current.state).toBe("recording");
    expect(fetchCalls.filter((call) => call.url === "/api/session-capture/segment")).toHaveLength(2);
    expect(closeAudioContext).not.toHaveBeenCalled();
  });

  it("trata duplicate: true como trecho persistido", async () => {
    segmentHandler = async () =>
      new Response(JSON.stringify({ ok: true, duplicate: true }), { status: 200 });

    const { result, onSegment } = await startRecording();
    await act(async () => {
      capturedOnChunk[0](audioBlob());
    });

    await waitFor(() => expect(onSegment).toHaveBeenCalledTimes(1));
    expect(result.current.segmentWarning).toBeNull();
    expect(result.current.state).toBe("recording");
  });

  it("retenta uma vez em falha de rede e avisa se o retry também falha", async () => {
    segmentHandler = async () => {
      throw new TypeError("Failed to fetch");
    };

    const { result, onSegment } = await startRecording();
    await act(async () => {
      capturedOnChunk[0](audioBlob());
    });

    await waitFor(() => expect(result.current.segmentWarning).toBe(SEGMENT_PERSISTENCE_WARNING));
    expect(onSegment).not.toHaveBeenCalled();
    expect(fetchCalls.filter((call) => call.url === "/api/session-capture/segment")).toHaveLength(2);
    expect(result.current.state).toBe("recording");
  });

  it("não retenta persistência em 403", async () => {
    segmentHandler = async () =>
      new Response(JSON.stringify({ error: "invalid_grant" }), { status: 403 });

    const { result, onSegment } = await startRecording();
    await act(async () => {
      capturedOnChunk[0](audioBlob());
    });

    await waitFor(() => expect(result.current.segmentWarning).toBe(SEGMENT_PERSISTENCE_WARNING));
    expect(onSegment).not.toHaveBeenCalled();
    expect(fetchCalls.filter((call) => call.url === "/api/session-capture/segment")).toHaveLength(1);
  });

  it("mostra a mensagem específica de consentimento e não pede microfone", async () => {
    grantHandler = () =>
      new Response(
        JSON.stringify({
          error: "consent_missing",
          message: "Consentimento não registrado para este paciente.",
        }),
        { status: 403 },
      );

    const onSegment = vi.fn();
    const { result } = renderHook(() =>
      useLocalTranscription({ sessionId, patientId, onSegment }),
    );

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.state).toBe("error");
    expect(result.current.errorMessage).toBe(
      "Consentimento não registrado para este paciente.",
    );
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(onSegment).not.toHaveBeenCalled();
  });

  it("usa fallback quando o grant devolve JSON inválido", async () => {
    grantHandler = () => new Response("internal boom", { status: 500 });

    const { result } = renderHook(() =>
      useLocalTranscription({ sessionId, patientId, onSegment: vi.fn() }),
    );

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.state).toBe("error");
    expect(result.current.errorMessage).toBe(CAPTURE_GRANT_FALLBACK_MESSAGE);
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it("fecha o AudioContext também quando o decode falha", async () => {
    class BrokenAudioContext {
      state = "running";
      resume = vi.fn(async () => {
        this.state = "running";
      });
      async decodeAudioData() {
        throw new Error("decode failed");
      }
      close = closeAudioContext;
    }
    vi.stubGlobal("AudioContext", BrokenAudioContext);

    const { result, onSegment } = await startRecording();
    await act(async () => {
      capturedOnChunk[0](audioBlob());
    });

    await waitFor(() =>
      expect(result.current.segmentWarning).toBe(
        "Um trecho não pôde ser transcrito. A transcrição continua.",
      ),
    );
    expect(onSegment).not.toHaveBeenCalled();
    expect(result.current.state).toBe("recording");
    expect(closeAudioContext).not.toHaveBeenCalled();
  });

  it("fecha o AudioContext compartilhado ao parar a captura", async () => {
    const { result } = await startRecording();
    await act(async () => {
      result.current.stop();
    });
    expect(result.current.state).toBe("completed");
    expect(closeAudioContext).toHaveBeenCalled();
  });
});

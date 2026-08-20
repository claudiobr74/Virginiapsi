"use client";

import { useCallback, useRef, useState } from "react";
import { ChunkedMicCapture } from "@/features/sessions/transcription/chunked-mic-capture";
import { resampleToMono16k } from "@/features/sessions/transcription/audio-resample";
import { detectTranscriptionDevice } from "@/features/sessions/transcription/device-capability";
import { loadLocalTranscriber, type LocalTranscriber } from "@/features/sessions/transcription/local-pipeline";
import { selectLocalModel, type LocalModelConfig } from "@/features/sessions/transcription/model-catalog";

// Vocabulary matches docs/06-integrations.md §3 "Estados de captura".
export type CaptureState =
  | "idle"
  | "preparing"
  | "recording"
  | "degraded"
  | "stopping"
  | "completed"
  | "error";

export interface TranscriptSegmentResult {
  sequence: number;
  text: string;
  startMs: number;
  endMs: number;
  provider: "local-webgpu" | "local-wasm";
}

export interface UseLocalTranscriptionOptions {
  sessionId: string;
  patientId: string;
  /** How often a chunk is finalized and transcribed. */
  chunkMs?: number;
  onSegment: (segment: TranscriptSegmentResult) => void;
  onError?: (message: string) => void;
}

export interface UseLocalTranscriptionResult {
  state: CaptureState;
  errorMessage: string | null;
  model: LocalModelConfig | null;
  start: () => Promise<void>;
  stop: () => void;
}

/**
 * On-device transcription (docs/22-transcription-provider-decision.md):
 * captures the microphone in short self-contained chunks (chunked, not
 * word-by-word streaming — a batch Whisper model architecturally can't do
 * the latter), runs each chunk through the local pipeline, and persists the
 * result as a final segment. There is no "interim" text in this path:
 * whatever is between chunk boundaries is simply not transcribed yet, so the
 * UI should show the *chunk itself* as in-progress rather than a partial
 * transcript.
 */
export function useLocalTranscription({
  sessionId,
  patientId,
  chunkMs = 8000,
  onSegment,
  onError,
}: UseLocalTranscriptionOptions): UseLocalTranscriptionResult {
  const [state, setState] = useState<CaptureState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [model, setModel] = useState<LocalModelConfig | null>(null);

  const captureRef = useRef<ChunkedMicCapture | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const transcriberRef = useRef<LocalTranscriber | null>(null);
  const grantRef = useRef<string | null>(null);
  const modelRef = useRef<LocalModelConfig | null>(null);
  const sequenceRef = useRef(0);
  const elapsedMsRef = useRef(0);

  const fail = useCallback(
    (message: string) => {
      setErrorMessage(message);
      setState("error");
      onError?.(message);
    },
    [onError],
  );

  const processChunk = useCallback(
    async (blob: Blob) => {
      const transcriber = transcriberRef.current;
      const grant = grantRef.current;
      const activeModel = modelRef.current;
      if (!transcriber || !grant || !activeModel) {
        return;
      }

      const startMs = elapsedMsRef.current;
      try {
        const arrayBuffer = await blob.arrayBuffer();
        const audioContext = new AudioContext();
        const decoded = await audioContext.decodeAudioData(arrayBuffer);
        const channels = Array.from({ length: decoded.numberOfChannels }, (_, index) =>
          decoded.getChannelData(index),
        );
        const audio = resampleToMono16k(channels, decoded.sampleRate, 16000);
        const durationMs = Math.round(decoded.duration * 1000);
        await audioContext.close();

        const output = await transcriber(audio, {
          language: "pt",
          task: "transcribe",
          chunk_length_s: 30,
        });
        elapsedMsRef.current += durationMs;

        const text = output.text?.trim();
        if (!text) {
          // Empty/silent chunk — a minimal (no-op) response is valid, we do
          // not persist an empty segment.
          return;
        }

        const sequence = sequenceRef.current;
        sequenceRef.current += 1;

        const segment: TranscriptSegmentResult = {
          sequence,
          text,
          startMs,
          endMs: startMs + durationMs,
          provider: activeModel.device === "webgpu" ? "local-webgpu" : "local-wasm",
        };

        await fetch("/api/session-capture/segment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            grant,
            sessionId,
            patientId,
            sequence: segment.sequence,
            text: segment.text,
            isFinal: true,
            startMs: segment.startMs,
            endMs: segment.endMs,
            provider: segment.provider,
          }),
        });

        onSegment(segment);
      } catch {
        // A single failed chunk must not take down the whole session; the
        // next chunk keeps the capture going (docs/01 §Transcrição: "nunca
        // depender de um payload único de áudio").
      }
    },
    [sessionId, patientId, onSegment],
  );

  const start = useCallback(async () => {
    setState("preparing");
    setErrorMessage(null);

    const grantResponse = await fetch("/api/session-capture/grant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patientId, sessionId }),
    });
    if (!grantResponse.ok) {
      const body = await grantResponse.json().catch(() => ({}) as { message?: string });
      fail(body.message ?? "Não foi possível autorizar a captura.");
      return;
    }
    const { grant } = (await grantResponse.json()) as { grant: string };
    grantRef.current = grant;

    const gpu = (navigator as unknown as { gpu?: { requestAdapter: () => Promise<unknown> } })
      .gpu;
    const device = await detectTranscriptionDevice(gpu);
    const selected = selectLocalModel(device);
    if (!selected) {
      setState("degraded");
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      fail("Não foi possível acessar o microfone.");
      return;
    }
    streamRef.current = stream;

    try {
      transcriberRef.current = await loadLocalTranscriber(selected);
    } catch {
      stream.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setState("degraded");
      return;
    }

    modelRef.current = selected;
    setModel(selected);

    const capture = new ChunkedMicCapture({
      stream,
      chunkMs,
      onChunk: (blob) => {
        void processChunk(blob);
      },
      onError: () => fail("Falha na captura de áudio."),
    });
    captureRef.current = capture;
    capture.start();
    setState("recording");
  }, [patientId, sessionId, chunkMs, fail, processChunk]);

  const stop = useCallback(() => {
    setState("stopping");
    captureRef.current?.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    captureRef.current = null;
    streamRef.current = null;
    setState("completed");
  }, []);

  return { state, errorMessage, model, start, stop };
}

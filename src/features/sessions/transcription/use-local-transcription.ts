"use client";

import { useCallback, useRef, useState } from "react";
import { ChunkedMicCapture } from "@/features/sessions/transcription/chunked-mic-capture";
import { resampleToMono16k } from "@/features/sessions/transcription/audio-resample";
import { detectTranscriptionDevice } from "@/features/sessions/transcription/device-capability";
import { loadLocalTranscriber, type LocalTranscriber } from "@/features/sessions/transcription/local-pipeline";
import { selectLocalModel, type LocalModelConfig } from "@/features/sessions/transcription/model-catalog";
import type { TranscriptSegmentOutput } from "@/features/sessions/transcription/provider";
import {
  CAPTURE_GRANT_FALLBACK_MESSAGE,
  readCaptureGrantErrorMessage,
} from "@/features/sessions/transcription/grant-error-message";
import {
  persistSessionSegment,
  SEGMENT_PERSISTENCE_WARNING,
} from "@/features/sessions/transcription/persist-session-segment";

// Vocabulary matches docs/06-integrations.md §3 "Estados de captura".
export type CaptureState =
  | "idle"
  | "preparing"
  | "recording"
  | "degraded"
  | "stopping"
  | "completed"
  | "error";

// The local adapters' slice of the shared TranscriptionProvider port output
// (src/features/sessions/transcription/provider.ts) — never "groq-batch"
// here, since this hook only ever runs the on-device path.
export type TranscriptSegmentResult = TranscriptSegmentOutput & {
  provider: "local-webgpu" | "local-wasm";
};

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
  /** Non-fatal persistence/decode warning; capture can continue. */
  segmentWarning: string | null;
  model: LocalModelConfig | null;
  /** 0-100 while the model/runtime download is in progress, otherwise null. */
  downloadPercent: number | null;
  start: () => Promise<void>;
  stop: () => void;
}

const CHUNK_TRANSCRIBE_WARNING =
  "Um trecho não pôde ser transcrito. A transcrição continua.";

function stopMediaStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop());
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
  const [segmentWarning, setSegmentWarning] = useState<string | null>(null);
  const [model, setModel] = useState<LocalModelConfig | null>(null);
  const [downloadPercent, setDownloadPercent] = useState<number | null>(null);

  const captureRef = useRef<ChunkedMicCapture | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const transcriberRef = useRef<LocalTranscriber | null>(null);
  const grantRef = useRef<string | null>(null);
  const modelRef = useRef<LocalModelConfig | null>(null);
  const sequenceRef = useRef(0);
  const elapsedMsRef = useRef(0);

  const resetCaptureRefs = useCallback(() => {
    captureRef.current?.stop();
    stopMediaStream(streamRef.current);
    captureRef.current = null;
    streamRef.current = null;
    transcriberRef.current = null;
    grantRef.current = null;
  }, []);

  const fail = useCallback(
    (message: string) => {
      resetCaptureRefs();
      setErrorMessage(message);
      setState("error");
      onError?.(message);
    },
    [onError, resetCaptureRefs],
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
      let audioContext: AudioContext | null = null;
      try {
        const arrayBuffer = await blob.arrayBuffer();
        audioContext = new AudioContext();
        const decoded = await audioContext.decodeAudioData(arrayBuffer);
        const channels = Array.from({ length: decoded.numberOfChannels }, (_, index) =>
          decoded.getChannelData(index),
        );
        const audio = resampleToMono16k(channels, decoded.sampleRate, 16000);
        const durationMs = Math.round(decoded.duration * 1000);

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

        // Reserve the sequence before awaiting persistence so overlapping
        // chunks cannot share a number. A failed persist leaves a gap rather
        // than mapping a later chunk onto a sequence the server may already
        // have stored.
        const sequence = sequenceRef.current;
        sequenceRef.current += 1;

        const segment: TranscriptSegmentResult = {
          sequence,
          text,
          startMs,
          endMs: startMs + durationMs,
          provider: activeModel.device === "webgpu" ? "local-webgpu" : "local-wasm",
        };

        const persisted = await persistSessionSegment({
          grant,
          sessionId,
          patientId,
          sequence: segment.sequence,
          text: segment.text,
          isFinal: true,
          startMs: segment.startMs,
          endMs: segment.endMs,
          provider: segment.provider,
        });

        if (!persisted.ok) {
          setSegmentWarning(SEGMENT_PERSISTENCE_WARNING);
          return;
        }

        setSegmentWarning(null);
        onSegment(segment);
      } catch {
        // A single failed decode/transcribe must not take down the whole
        // session; the next chunk keeps the capture going (docs/01 §Transcrição:
        // "nunca depender de um payload único de áudio"). The failure is
        // visible as a non-fatal warning — never silent.
        setSegmentWarning(CHUNK_TRANSCRIBE_WARNING);
      } finally {
        if (audioContext) {
          await audioContext.close().catch(() => undefined);
        }
      }
    },
    [sessionId, patientId, onSegment],
  );

  const start = useCallback(async () => {
    setState("preparing");
    setErrorMessage(null);
    setSegmentWarning(null);

    const grantResponse = await fetch("/api/session-capture/grant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patientId, sessionId }),
    }).catch(() => null);
    if (!grantResponse) {
      fail(CAPTURE_GRANT_FALLBACK_MESSAGE);
      return;
    }
    if (!grantResponse.ok) {
      fail(await readCaptureGrantErrorMessage(grantResponse));
      return;
    }

    let grantPayload: unknown;
    try {
      grantPayload = await grantResponse.json();
    } catch {
      fail(CAPTURE_GRANT_FALLBACK_MESSAGE);
      return;
    }
    const grant =
      grantPayload &&
      typeof grantPayload === "object" &&
      "grant" in grantPayload &&
      typeof (grantPayload as { grant: unknown }).grant === "string"
        ? (grantPayload as { grant: string }).grant
        : "";
    if (!grant) {
      fail(CAPTURE_GRANT_FALLBACK_MESSAGE);
      return;
    }
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
      setDownloadPercent(0);
      transcriberRef.current = await loadLocalTranscriber(selected, {
        onProgress: ({ percent }) => setDownloadPercent(percent),
      });
    } catch {
      stopMediaStream(stream);
      streamRef.current = null;
      grantRef.current = null;
      setState("degraded");
      return;
    } finally {
      setDownloadPercent(null);
    }

    modelRef.current = selected;
    setModel(selected);

    try {
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
    } catch {
      stopMediaStream(stream);
      streamRef.current = null;
      grantRef.current = null;
      transcriberRef.current = null;
      fail("Falha na captura de áudio.");
    }
  }, [patientId, sessionId, chunkMs, fail, processChunk]);

  const stop = useCallback(() => {
    setState("stopping");
    captureRef.current?.stop();
    stopMediaStream(streamRef.current);
    captureRef.current = null;
    streamRef.current = null;
    setState("completed");
  }, []);

  return {
    state,
    errorMessage,
    segmentWarning,
    model,
    downloadPercent,
    start,
    stop,
  };
}

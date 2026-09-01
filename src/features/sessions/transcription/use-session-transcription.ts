"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEFAULT_TRANSCRIPTION_CHUNK_MS,
  type SessionCaptureState,
  type TranscriptionBackpressure,
} from "@/features/sessions/transcription/constants";
import { nextTranscriptSequence } from "@/features/sessions/transcription/audio-chunk";
import {
  buildProgressiveAudioConstraints,
  readSupportedAudioConstraints,
} from "@/features/sessions/transcription/audio-constraints";
import { acquireSessionCaptureLock, type CaptureLock } from "@/features/sessions/transcription/capture-lock";
import {
  CAPTURE_GRANT_FALLBACK_MESSAGE,
  readCaptureGrantErrorMessage,
} from "@/features/sessions/transcription/grant-error-message";
import {
  MEDIA_RECORDER_UNSUPPORTED_MESSAGE,
  mapGetUserMediaError,
} from "@/features/sessions/transcription/microphone-errors";
import { isMediaRecorderAvailable } from "@/features/sessions/transcription/mime-negotiation";
import { SessionAudioCapture } from "@/features/sessions/transcription/session-audio-capture";
import { createSessionAudioSpool, type SessionAudioSpool } from "@/features/sessions/transcription/session-audio-spool";
import {
  SessionTranscriptionTransport,
  type ConfirmedTranscriptSegment,
} from "@/features/sessions/transcription/session-transcription-transport";
import { requestScreenWakeLock, subscribeVisibility, type WakeLockHandle } from "@/features/sessions/transcription/wake-lock";
import {
  readStorageEstimate,
  requestPersistentStorage,
} from "@/features/sessions/transcription/spool-crypto";

export type TranscriptSegmentResult = ConfirmedTranscriptSegment;

export interface UseSessionTranscriptionOptions {
  sessionId: string;
  patientId: string;
  organizationId: string;
  initialSequences?: number[];
  chunkMs?: number;
  onSegment: (segment: TranscriptSegmentResult) => void;
  onError?: (message: string) => void;
}

export interface UseSessionTranscriptionResult {
  state: SessionCaptureState;
  errorMessage: string | null;
  segmentWarning: string | null;
  statusDetail: string | null;
  pendingRecoveryCount: number;
  transcribedMs: number;
  preservedMs: number;
  backgroundWarning: string | null;
  lowStorageWarning: boolean;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  recoverPending: () => Promise<void>;
}

function stopMediaStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop());
}

export function useSessionTranscription({
  sessionId,
  patientId,
  organizationId,
  initialSequences = [],
  chunkMs = DEFAULT_TRANSCRIPTION_CHUNK_MS,
  onSegment,
  onError,
}: UseSessionTranscriptionOptions): UseSessionTranscriptionResult {
  const [state, setState] = useState<SessionCaptureState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [segmentWarning, setSegmentWarning] = useState<string | null>(null);
  const [statusDetail, setStatusDetail] = useState<string | null>(null);
  const [pendingRecoveryCount, setPendingRecoveryCount] = useState(0);
  const [transcribedMs, setTranscribedMs] = useState(0);
  const [preservedMs, setPreservedMs] = useState(0);
  const [backgroundWarning, setBackgroundWarning] = useState<string | null>(null);
  const [lowStorageWarning, setLowStorageWarning] = useState(false);

  const captureRef = useRef<SessionAudioCapture | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const transportRef = useRef<SessionTranscriptionTransport | null>(null);
  const spoolRef = useRef<SessionAudioSpool | null>(null);
  const grantRef = useRef<string | null>(null);
  const lockRef = useRef<CaptureLock | null>(null);
  const wakeLockRef = useRef<WakeLockHandle | null>(null);
  const visibilityRef = useRef<(() => void) | null>(null);
  const onlineRef = useRef<(() => void) | null>(null);
  const stateRef = useRef<SessionCaptureState>("idle");

  const setCaptureState = useCallback((next: SessionCaptureState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const refreshSpoolCount = useCallback(async () => {
    const spool = spoolRef.current;
    if (!spool) {
      return 0;
    }
    const count = await spool.count(organizationId, sessionId);
    setPendingRecoveryCount(count);
    return count;
  }, [organizationId, sessionId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const spool = await createSessionAudioSpool();
      if (cancelled) {
        return;
      }
      spoolRef.current = spool;
      if (spool.status === "available") {
        await requestPersistentStorage().catch(() => null);
      }
      const count = await spool.count(organizationId, sessionId);
      if (!cancelled) {
        setPendingRecoveryCount(count);
      }
      const estimate = await readStorageEstimate();
      if (estimate && estimate.quota > 0 && estimate.quota - estimate.usage < 8 * 1024 * 1024) {
        setLowStorageWarning(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [organizationId, sessionId]);

  const resetHardware = useCallback(async () => {
    captureRef.current?.stop();
    stopMediaStream(streamRef.current);
    captureRef.current = null;
    streamRef.current = null;
    await wakeLockRef.current?.release().catch(() => undefined);
    wakeLockRef.current = null;
    visibilityRef.current?.();
    visibilityRef.current = null;
    if (onlineRef.current) {
      window.removeEventListener("online", onlineRef.current);
      onlineRef.current = null;
    }
    await lockRef.current?.release().catch(() => undefined);
    lockRef.current = null;
  }, []);

  const fail = useCallback(
    async (message: string) => {
      await resetHardware();
      setErrorMessage(message);
      setCaptureState("error");
      onError?.(message);
    },
    [onError, resetHardware, setCaptureState],
  );

  const applyBackpressure = useCallback((level: TranscriptionBackpressure) => {
    if (stateRef.current === "stopping" || stateRef.current === "completed") {
      return;
    }
    if (level === "critical") {
      setLowStorageWarning(true);
      setStatusDetail(
        "Pouco espaço disponível no dispositivo. A gravação local de segurança pode não conseguir preservar toda a sessão.",
      );
      setCaptureState("local_backup");
      return;
    }
    if (level === "spooling") {
      setStatusDetail(
        "A conexão com a transcrição está indisponível. Os trechos ainda não processados estão sendo preservados de forma criptografada neste dispositivo.",
      );
      setCaptureState("local_backup");
      return;
    }
    if (level === "degraded") {
      setStatusDetail("Conexão instável. Alguns trechos aguardam transcrição.");
      setCaptureState("connection_degraded");
      return;
    }
    setStatusDetail(null);
    if (stateRef.current === "connection_degraded" || stateRef.current === "local_backup") {
      setCaptureState("recording");
    }
  }, [setCaptureState]);

  const start = useCallback(async () => {
    if (!isMediaRecorderAvailable()) {
      await fail(MEDIA_RECORDER_UNSUPPORTED_MESSAGE);
      return;
    }

    setErrorMessage(null);
    setSegmentWarning(null);
    setBackgroundWarning(null);
    setCaptureState("requesting_microphone");

    let stream: MediaStream;
    try {
      const supported = readSupportedAudioConstraints(navigator.mediaDevices);
      stream = await navigator.mediaDevices.getUserMedia({
        audio: buildProgressiveAudioConstraints(supported),
        video: false,
      });
    } catch (error) {
      const mapped = mapGetUserMediaError(error);
      await fail(mapped.message);
      return;
    }
    streamRef.current = stream;

    setCaptureState("authorizing");
    const lock = await acquireSessionCaptureLock(sessionId);
    if (!lock) {
      stopMediaStream(stream);
      streamRef.current = null;
      await fail("Esta sessão já está sendo transcrita em outra aba.");
      return;
    }
    lockRef.current = lock;

    let grant: string;
    try {
      const response = await fetch("/api/session-capture/grant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientId, sessionId }),
      });
      if (!response.ok) {
        await fail(await readCaptureGrantErrorMessage(response));
        return;
      }
      const body = (await response.json()) as { grant?: unknown };
      if (typeof body.grant !== "string" || body.grant.length === 0) {
        await fail(CAPTURE_GRANT_FALLBACK_MESSAGE);
        return;
      }
      grant = body.grant;
    } catch {
      await fail(CAPTURE_GRANT_FALLBACK_MESSAGE);
      return;
    }
    grantRef.current = grant;

    const spool = spoolRef.current ?? (await createSessionAudioSpool());
    spoolRef.current = spool;

    const transport = new SessionTranscriptionTransport(
      {
        grant,
        patientId,
        organizationId,
        sessionId,
        spool,
        onAck: (segment) => {
          setSegmentWarning(null);
          setTranscribedMs((current) => Math.max(current, segment.endMs));
          onSegment(segment);
          void refreshSpoolCount();
        },
        onBackpressure: applyBackpressure,
        onFailed: (message) => setSegmentWarning(message),
      },
      nextTranscriptSequence(initialSequences),
    );
    transportRef.current = transport;

    const capture = new SessionAudioCapture({
      stream,
      chunkMs,
      onChunk: (slice) => {
        transport.enqueueSlice(slice);
        setPreservedMs((current) => Math.max(current, slice.endMs));
      },
      onError: () => {
        void fail("A captura de áudio foi interrompida.");
      },
    });
    captureRef.current = capture;
    capture.start();

    wakeLockRef.current = await requestScreenWakeLock();
    visibilityRef.current = subscribeVisibility(
      () => {
        console.info(
          JSON.stringify({
            level: "info",
            event: "capture_visibility_hidden",
            sessionScoped: true,
          }),
        );
      },
      () => {
        setBackgroundWarning(
          "A sessão precisa permanecer visível durante a transcrição. O navegador pode suspender a captura em segundo plano.",
        );
      },
    );

    const onOnline = () => {
      void transport.recoverFromSpool();
    };
    onlineRef.current = onOnline;
    window.addEventListener("online", onOnline);

    setCaptureState("recording");
    setStatusDetail(null);
  }, [
    applyBackpressure,
    chunkMs,
    fail,
    initialSequences,
    onSegment,
    organizationId,
    patientId,
    refreshSpoolCount,
    sessionId,
    setCaptureState,
  ]);

  const recoverPending = useCallback(async () => {
    setCaptureState("recovering");
    setStatusDetail("Os trechos preservados durante a interrupção estão sendo processados.");
    let grant = grantRef.current;
    if (!grant) {
      const response = await fetch("/api/session-capture/grant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientId, sessionId }),
      });
      if (!response.ok) {
        await fail(await readCaptureGrantErrorMessage(response));
        return;
      }
      const body = (await response.json()) as { grant?: unknown };
      if (typeof body.grant !== "string") {
        await fail(CAPTURE_GRANT_FALLBACK_MESSAGE);
        return;
      }
      grant = body.grant;
      grantRef.current = grant;
    }

    const spool = spoolRef.current ?? (await createSessionAudioSpool());
    spoolRef.current = spool;
    const transport =
      transportRef.current ??
      new SessionTranscriptionTransport(
        {
          grant,
          patientId,
          organizationId,
          sessionId,
          spool,
          onAck: (segment) => {
            setTranscribedMs((current) => Math.max(current, segment.endMs));
            onSegment(segment);
          },
          onBackpressure: applyBackpressure,
          onFailed: (message) => setSegmentWarning(message),
        },
        nextTranscriptSequence(initialSequences),
      );
    transportRef.current = transport;
    await transport.recoverFromSpool();
    await refreshSpoolCount();
    setStatusDetail(null);
    setCaptureState(captureRef.current ? "recording" : "idle");
  }, [
    applyBackpressure,
    fail,
    initialSequences,
    onSegment,
    organizationId,
    patientId,
    refreshSpoolCount,
    sessionId,
    setCaptureState,
  ]);

  const stop = useCallback(async () => {
    setCaptureState("stopping");
    await captureRef.current?.stop();
    const transport = transportRef.current;
    await transport?.drain();
    if (navigator.onLine !== false) {
      await transport?.recoverFromSpool();
    }
    const remaining = await refreshSpoolCount();
    await resetHardware();
    transportRef.current = null;
    grantRef.current = null;
    setCaptureState("completed");
    if (remaining > 0) {
      setStatusDetail(
        `Sessão encerrada. Trechos já transcritos permanecem no prontuário. ${remaining} trecho(s) preservado(s) neste dispositivo serão concluídos quando houver conexão.`,
      );
    }
  }, [refreshSpoolCount, resetHardware, setCaptureState]);

  return {
    state,
    errorMessage,
    segmentWarning,
    statusDetail,
    pendingRecoveryCount,
    transcribedMs,
    preservedMs,
    backgroundWarning,
    lowStorageWarning,
    start,
    stop,
    recoverPending,
  };
}

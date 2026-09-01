import { DEFAULT_TRANSCRIPTION_CHUNK_MS } from "@/features/sessions/transcription/constants";
import { createAudioChunkId } from "@/features/sessions/transcription/audio-chunk";
import { createSessionMediaRecorder } from "@/features/sessions/transcription/mime-negotiation";

export type CapturedAudioSlice = {
  chunkId: string;
  blob: Blob;
  mimeType: string;
  startMs: number;
  endMs: number;
  createdAt: number;
};

export interface SessionAudioCaptureOptions {
  stream: MediaStream;
  chunkMs?: number;
  onChunk: (slice: CapturedAudioSlice) => void;
  onError: (error: unknown) => void;
  now?: () => number;
  createRecorder?: (stream: MediaStream) => MediaRecorder;
}

/**
 * Microphone + MediaRecorder only. Does not call Groq, persist text, or
 * touch IndexedDB. Capture keeps rotating while a previous slice is still
 * in the transport pipeline.
 *
 * Recorders are stopped and awaited before the next one starts so Safari
 * and Chromium both emit independently-decodable containers.
 */
export class SessionAudioCapture {
  private recorder: MediaRecorder | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private captureOriginMs: number;
  private readonly now: () => number;
  private readonly chunkMs: number;

  constructor(private readonly options: SessionAudioCaptureOptions) {
    this.now = options.now ?? (() => performance.now());
    this.chunkMs = options.chunkMs ?? DEFAULT_TRANSCRIPTION_CHUNK_MS;
    this.captureOriginMs = this.now();
  }

  start(): void {
    this.stopped = false;
    this.captureOriginMs = this.now();
    this.startChunk();
    this.scheduleRotate();
  }

  /** Flushes the in-flight container. Track teardown is the caller's job. */
  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    await this.flushRecorder();
  }

  private scheduleRotate(): void {
    if (this.stopped) {
      return;
    }
    this.timer = setTimeout(() => {
      void this.rotateChunk();
    }, this.chunkMs);
  }

  private startChunk(): void {
    const factory = this.options.createRecorder ?? createSessionMediaRecorder;
    let recorder: MediaRecorder;
    try {
      recorder = factory(this.options.stream);
    } catch (error) {
      this.options.onError(error);
      return;
    }

    const chunks: Blob[] = [];
    const chunkOriginMs = this.now();

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunks.push(event.data);
      }
    };
    recorder.onstop = () => {
      if (chunks.length === 0) {
        return;
      }
      const mimeType = recorder.mimeType || chunks[0]?.type || "application/octet-stream";
      const blob = new Blob(chunks, { type: mimeType });
      if (blob.size === 0) {
        return;
      }
      const endMs = Math.max(0, Math.round(this.now() - this.captureOriginMs));
      const startMs = Math.max(0, Math.round(chunkOriginMs - this.captureOriginMs));
      this.options.onChunk({
        chunkId: createAudioChunkId(),
        blob,
        mimeType,
        startMs,
        endMs: Math.max(endMs, startMs),
        createdAt: Date.now(),
      });
    };
    recorder.onerror = (event) => this.options.onError(event);

    recorder.start();
    this.recorder = recorder;
  }

  private flushRecorder(): Promise<void> {
    const recorder = this.recorder;
    this.recorder = null;
    if (!recorder || recorder.state === "inactive") {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const previous = recorder.onstop;
      recorder.onstop = (event) => {
        previous?.call(recorder, event);
        resolve();
      };
      try {
        recorder.stop();
      } catch {
        resolve();
      }
    });
  }

  private async rotateChunk(): Promise<void> {
    if (this.stopped) {
      return;
    }
    await this.flushRecorder();
    if (this.stopped) {
      return;
    }
    this.startChunk();
    this.scheduleRotate();
  }
}

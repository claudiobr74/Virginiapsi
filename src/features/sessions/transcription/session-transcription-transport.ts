import type { AudioChunk } from "@/features/sessions/transcription/audio-chunk";
import type { TranscriptionBackpressure } from "@/features/sessions/transcription/constants";
import type { SessionAudioSpool } from "@/features/sessions/transcription/session-audio-spool";
import {
  sendTranscriptionChunk,
  type TranscribeChunkAck,
} from "@/features/sessions/transcription/transcribe-chunk-client";

const MAX_MEMORY_RETRIES = 2;

export type ConfirmedTranscriptSegment = {
  sequence: number;
  text: string;
  startMs: number;
  endMs: number;
  provider: "groq-batch";
};

export interface SessionTranscriptionTransportOptions {
  grant: string;
  patientId: string;
  organizationId: string;
  sessionId: string;
  spool: SessionAudioSpool;
  fetchImpl?: typeof fetch;
  onAck: (segment: ConfirmedTranscriptSegment) => void;
  onBackpressure: (level: TranscriptionBackpressure) => void;
  onFailed: (message: string) => void;
  delay?: (ms: number) => Promise<void>;
  isOnline?: () => boolean;
}

function backoffMs(retryCount: number): number {
  return Math.min(8_000, 500 * 2 ** retryCount);
}

export class SessionTranscriptionTransport {
  private readonly memory: AudioChunk[] = [];
  private readonly queuedIds = new Set<string>();
  private pumpPromise: Promise<void> | null = null;
  private nextSequence: number;
  private readonly delay: (ms: number) => Promise<void>;
  private readonly fetchImpl: typeof fetch;
  private readonly isOnline: () => boolean;

  constructor(
    private readonly options: SessionTranscriptionTransportOptions,
    initialSequence: number,
  ) {
    this.nextSequence = initialSequence;
    this.delay = options.delay ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.isOnline = options.isOnline ?? (() => navigator.onLine !== false);
  }

  peekNextSequence(): number {
    return this.nextSequence;
  }

  enqueueSlice(slice: {
    chunkId: string;
    blob: Blob;
    mimeType: string;
    startMs: number;
    endMs: number;
    createdAt: number;
  }): AudioChunk {
    const chunk: AudioChunk = {
      chunkId: slice.chunkId,
      sequence: this.nextSequence,
      sessionId: this.options.sessionId,
      organizationId: this.options.organizationId,
      blob: slice.blob,
      mimeType: slice.mimeType,
      startMs: slice.startMs,
      endMs: slice.endMs,
      createdAt: slice.createdAt,
      retryCount: 0,
      state: "memory",
    };
    this.nextSequence += 1;
    this.queuedIds.add(chunk.chunkId);
    this.memory.push(chunk);
    void this.pump();
    return chunk;
  }

  enqueueExisting(chunk: AudioChunk): void {
    if (this.queuedIds.has(chunk.chunkId)) {
      return;
    }
    this.queuedIds.add(chunk.chunkId);
    this.memory.push({ ...chunk, state: "memory" });
    if (chunk.sequence >= this.nextSequence) {
      this.nextSequence = chunk.sequence + 1;
    }
    void this.pump();
  }

  memoryDepth(): number {
    return this.memory.length;
  }

  async drain(): Promise<void> {
    await this.pump();
  }

  private emitBackpressure(): void {
    const memory = this.memory.length;
    if (memory === 0) {
      this.options.onBackpressure("normal");
      return;
    }
    if (this.options.spool.status !== "available" && memory > 2) {
      this.options.onBackpressure("critical");
      return;
    }
    if (memory > 2) {
      this.options.onBackpressure("degraded");
      return;
    }
    this.options.onBackpressure("degraded");
  }

  private pump(): Promise<void> {
    if (this.pumpPromise) {
      return this.pumpPromise;
    }
    this.pumpPromise = this.runPump().finally(() => {
      this.pumpPromise = null;
    });
    return this.pumpPromise;
  }

  private async runPump(): Promise<void> {
    while (this.memory.length > 0) {
      const chunk = this.memory[0];
      chunk.state = "sending";
      const result = await sendTranscriptionChunk(
        chunk,
        this.options.grant,
        this.options.patientId,
        this.fetchImpl,
      );

      if (result.ok) {
        this.memory.shift();
        this.queuedIds.delete(chunk.chunkId);
        await this.options.spool.delete(chunk.chunkId).catch(() => undefined);
        if (result.segment?.text) {
          this.options.onAck(result.segment);
        }
        this.emitBackpressure();
        continue;
      }

      if (!result.retryable) {
        this.memory.shift();
        this.queuedIds.delete(chunk.chunkId);
        this.options.onFailed("Um trecho não pôde ser transcrito. A transcrição continua.");
        continue;
      }

      chunk.retryCount += 1;
      chunk.state = "memory";
      const shouldSpool =
        !this.isOnline() || chunk.retryCount > MAX_MEMORY_RETRIES || result.status === 0;

      if (shouldSpool && this.options.spool.status === "available") {
        const stored = await this.options.spool.put(chunk);
        if (stored) {
          this.memory.shift();
          this.queuedIds.delete(chunk.chunkId);
          chunk.state = "spooled";
          this.options.onBackpressure("spooling");
          continue;
        }
        this.options.onBackpressure("critical");
        break;
      } else if (shouldSpool) {
        this.options.onBackpressure("critical");
        break;
      } else {
        this.emitBackpressure();
      }

      await this.delay(backoffMs(chunk.retryCount));
    }
  }

  async recoverFromSpool(): Promise<number> {
    if (this.options.spool.status !== "available") {
      return 0;
    }
    const pending = await this.options.spool.take(
      this.options.organizationId,
      this.options.sessionId,
    );
    for (const chunk of pending) {
      this.enqueueExisting(chunk);
    }
    if (pending.length > 0) {
      this.options.onBackpressure("spooling");
      await this.drain();
    }
    return pending.length;
  }
}

export async function recoverSpooledChunks(
  transport: SessionTranscriptionTransport,
): Promise<number> {
  return transport.recoverFromSpool();
}

export type { TranscribeChunkAck };

export type AudioChunkState = "memory" | "sending" | "spooled" | "confirmed" | "failed";

export type AudioChunk = {
  chunkId: string;
  sequence: number;
  sessionId: string;
  organizationId: string;
  blob: Blob;
  mimeType: string;
  startMs: number;
  endMs: number;
  createdAt: number;
  retryCount: number;
  state: AudioChunkState;
};

export function createAudioChunkId(): string {
  return crypto.randomUUID();
}

export function nextTranscriptSequence(existingSequences: Iterable<number>): number {
  let max = -1;
  for (const sequence of existingSequences) {
    if (Number.isInteger(sequence) && sequence > max) {
      max = sequence;
    }
  }
  return max + 1;
}

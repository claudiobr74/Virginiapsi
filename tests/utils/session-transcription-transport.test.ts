import { describe, expect, it, vi } from "vitest";
import { SessionTranscriptionTransport } from "@/features/sessions/transcription/session-transcription-transport";
import type { SessionAudioSpool } from "@/features/sessions/transcription/session-audio-spool";
import type { AudioChunk } from "@/features/sessions/transcription/audio-chunk";

function chunk(overrides: Partial<AudioChunk> = {}): AudioChunk {
  return {
    chunkId: "11111111-1111-4111-8111-111111111111",
    sequence: 0,
    sessionId: "33333333-3333-4333-8333-333333333333",
    organizationId: "44444444-4444-4444-8444-444444444444",
    blob: new Blob([new Uint8Array([1, 2, 3])], { type: "audio/webm" }),
    mimeType: "audio/webm",
    startMs: 0,
    endMs: 15000,
    createdAt: Date.now(),
    retryCount: 0,
    state: "memory",
    ...overrides,
  };
}

function memorySpool(store: Map<string, AudioChunk> = new Map()): SessionAudioSpool {
  return {
    status: "available",
    async put(item) {
      store.set(item.chunkId, item);
      return true;
    },
    async take() {
      return [...store.values()];
    },
    async delete(chunkId) {
      store.delete(chunkId);
    },
    async count() {
      return store.size;
    },
  };
}

describe("SessionTranscriptionTransport", () => {
  it("é FIFO, confirma só após ACK e apaga o spool", async () => {
    const acks: number[] = [];
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          ok: true,
          already_processed: false,
          segment: { sequence: 0, text: "olá", startMs: 0, endMs: 15000, provider: "groq-batch" },
        }),
        { status: 200 },
      ),
    );
    const store = new Map<string, AudioChunk>();
    const transport = new SessionTranscriptionTransport(
      {
        grant: "g",
        patientId: "22222222-2222-4222-8222-222222222222",
        organizationId: "44444444-4444-4444-8444-444444444444",
        sessionId: "33333333-3333-4333-8333-333333333333",
        spool: memorySpool(store),
        fetchImpl: fetchImpl as unknown as typeof fetch,
        onAck: (segment) => acks.push(segment.sequence),
        onBackpressure: () => undefined,
        onFailed: () => undefined,
        delay: async () => undefined,
      },
      0,
    );

    transport.enqueueSlice({
      chunkId: chunk().chunkId,
      blob: chunk().blob,
      mimeType: "audio/webm",
      startMs: 0,
      endMs: 15000,
      createdAt: Date.now(),
    });
    await transport.drain();
    expect(acks).toEqual([0]);
    expect(store.size).toBe(0);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("reenvia 429/rede e faz spool após retries", async () => {
    const store = new Map<string, AudioChunk>();
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls += 1;
      return new Response("no", { status: 429 });
    });
    const transport = new SessionTranscriptionTransport(
      {
        grant: "g",
        patientId: "22222222-2222-4222-8222-222222222222",
        organizationId: "44444444-4444-4444-8444-444444444444",
        sessionId: "33333333-3333-4333-8333-333333333333",
        spool: memorySpool(store),
        fetchImpl: fetchImpl as unknown as typeof fetch,
        onAck: () => undefined,
        onBackpressure: () => undefined,
        onFailed: () => undefined,
        delay: async () => undefined,
        isOnline: () => false,
      },
      0,
    );

    transport.enqueueSlice({
      chunkId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      blob: new Blob([new Uint8Array([9])], { type: "audio/webm" }),
      mimeType: "audio/webm",
      startMs: 0,
      endMs: 15000,
      createdAt: Date.now(),
    });
    await transport.drain();
    expect(store.size).toBe(1);
    expect(calls).toBeGreaterThan(0);
  });

  it("spool indisponível não afirma preservação e mantém o chunk na memória", async () => {
    const levels: string[] = [];
    const fetchImpl = vi.fn(async () => {
      throw new Error("offline");
    });
    const unavailable: SessionAudioSpool = {
      status: "SECURE_SPOOL_UNAVAILABLE",
      async put() {
        throw new Error("spool must not be written");
      },
      async take() {
        return [];
      },
      async delete() {},
      async count() {
        return 0;
      },
    };
    const transport = new SessionTranscriptionTransport(
      {
        grant: "g",
        patientId: "22222222-2222-4222-8222-222222222222",
        organizationId: "44444444-4444-4444-8444-444444444444",
        sessionId: "33333333-3333-4333-8333-333333333333",
        spool: unavailable,
        fetchImpl: fetchImpl as unknown as typeof fetch,
        onAck: () => undefined,
        onBackpressure: (level) => levels.push(level),
        onFailed: () => undefined,
        delay: async () => undefined,
        isOnline: () => false,
      },
      0,
    );
    transport.enqueueSlice({
      chunkId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      blob: new Blob([new Uint8Array([2])], { type: "audio/webm" }),
      mimeType: "audio/webm",
      startMs: 0,
      endMs: 15000,
      createdAt: Date.now(),
    });
    await transport.drain();
    expect(transport.memoryDepth()).toBe(1);
    expect(levels.at(-1)).toBe("critical");
    expect(levels).not.toContain("spooling");
  });

  it("recupera spool, reenvia e apaga após ACK", async () => {
    const store = new Map<string, AudioChunk>();
    const pending = chunk({ chunkId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", sequence: 4 });
    store.set(pending.chunkId, pending);
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          ok: true,
          already_processed: false,
          segment: { sequence: 4, text: "recuperado", startMs: 0, endMs: 15000, provider: "groq-batch" },
        }),
        { status: 200 },
      ),
    );
    const acks: number[] = [];
    const transport = new SessionTranscriptionTransport(
      {
        grant: "g",
        patientId: "22222222-2222-4222-8222-222222222222",
        organizationId: "44444444-4444-4444-8444-444444444444",
        sessionId: "33333333-3333-4333-8333-333333333333",
        spool: memorySpool(store),
        fetchImpl: fetchImpl as unknown as typeof fetch,
        onAck: (segment) => acks.push(segment.sequence),
        onBackpressure: () => undefined,
        onFailed: () => undefined,
        delay: async () => undefined,
      },
      0,
    );

    expect(await transport.recoverFromSpool()).toBe(1);
    expect(acks).toEqual([4]);
    expect(store.size).toBe(0);
    expect(transport.peekNextSequence()).toBe(5);
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { createSessionAudioSpool } from "@/features/sessions/transcription/session-audio-spool";
import type { AudioChunk } from "@/features/sessions/transcription/audio-chunk";

function sampleChunk(overrides: Partial<AudioChunk> = {}): AudioChunk {
  return {
    chunkId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    sequence: 0,
    sessionId: "33333333-3333-4333-8333-333333333333",
    organizationId: "11111111-1111-4111-8111-111111111111",
    blob: {
      type: "audio/webm",
      arrayBuffer: async () => Uint8Array.from([9, 8, 7, 6]),
    } as unknown as Blob,
    mimeType: "audio/webm",
    startMs: 0,
    endMs: 15000,
    createdAt: Date.now(),
    retryCount: 0,
    state: "memory",
    ...overrides,
  };
}

type MemoryDb = {
  stores: Map<string, Map<IDBValidKey, unknown>>;
};

function createMemoryIndexedDb(options: {
  persistCryptoKey: boolean;
  onPut?: (storeName: string, value: unknown) => void;
}): IDBFactory {
  const databases = new Map<string, MemoryDb>();

  function dbFor(name: string): MemoryDb {
    const existing = databases.get(name);
    if (existing) {
      return existing;
    }
    const created: MemoryDb = { stores: new Map() };
    databases.set(name, created);
    return created;
  }

  function objectStore(db: MemoryDb, storeName: string, tx: { failed: boolean; error: Error | null }) {
    if (!db.stores.has(storeName)) {
      db.stores.set(storeName, new Map());
    }
    const store = db.stores.get(storeName) as Map<IDBValidKey, unknown>;
    return {
      put(value: unknown, key?: IDBValidKey) {
        options.onPut?.(storeName, value);
        if (value instanceof CryptoKey && !options.persistCryptoKey) {
          tx.failed = true;
          tx.error = new Error("DataCloneError");
          return {};
        }
        if (key !== undefined) {
          store.set(key, value);
        } else if (value && typeof value === "object" && "chunkId" in value) {
          store.set((value as { chunkId: string }).chunkId, value);
        }
        return {};
      },
      get(key: IDBValidKey) {
        const request: IDBRequest = {
          result: store.get(key),
          error: null,
          onsuccess: null,
          onerror: null,
        } as IDBRequest;
        queueMicrotask(() => {
          request.onsuccess?.(new Event("success"));
        });
        return request;
      },
      getAll() {
        const request: IDBRequest = {
          result: [...store.values()],
          error: null,
          onsuccess: null,
          onerror: null,
        } as IDBRequest;
        queueMicrotask(() => {
          request.onsuccess?.(new Event("success"));
        });
        return request;
      },
      delete(key: IDBValidKey) {
        store.delete(key);
        return {};
      },
    };
  }

  function open(name: string): IDBOpenDBRequest {
    const request = {
      result: undefined as IDBDatabase | undefined,
      error: null,
      onsuccess: null as ((ev: Event) => void) | null,
      onerror: null as ((ev: Event) => void) | null,
      onupgradeneeded: null as ((ev: Event) => void) | null,
    };
    queueMicrotask(() => {
      const memory = dbFor(name);
      const isNew = memory.stores.size === 0;
      const database = {
        name,
        objectStoreNames: {
          contains: (storeName: string) => memory.stores.has(storeName),
        },
        createObjectStore(storeName: string) {
          memory.stores.set(storeName, new Map());
          return {};
        },
        close() {},
        transaction() {
          const tx = {
            failed: false,
            error: null as Error | null,
            oncomplete: null as (() => void) | null,
            onerror: null as (() => void) | null,
            objectStore: (requested: string) => objectStore(memory, requested, tx),
          };
          queueMicrotask(() => {
            if (tx.failed) {
              tx.onerror?.();
              return;
            }
            tx.oncomplete?.();
          });
          return tx as unknown as IDBTransaction;
        },
      } as unknown as IDBDatabase;
      request.result = database;
      if (isNew) {
        request.onupgradeneeded?.(new Event("upgradeneeded"));
      }
      request.onsuccess?.(new Event("success"));
    });
    return request as unknown as IDBOpenDBRequest;
  }

  return { open } as IDBFactory;
}

describe("session audio spool — fail-closed", () => {
  it("CryptoKey persistível deixa o spool available e não grava plaintext", async () => {
    const puts: unknown[] = [];
    const indexedDb = createMemoryIndexedDb({
      persistCryptoKey: true,
      onPut: (storeName, value) => {
        if (storeName === "keys" || storeName === "chunks") {
          puts.push({ storeName, value });
        }
      },
    });
    const spool = await createSessionAudioSpool({ indexedDb, subtle: crypto.subtle });
    expect(spool.status).toBe("available");
    const stored = await spool.put(sampleChunk());
    expect(stored).toBe(true);
    expect(JSON.stringify(puts)).not.toMatch(/blob/);
    for (const entry of puts) {
      const value = (entry as { value: unknown }).value;
      expect(value instanceof ArrayBuffer).toBe(false);
      if (value && typeof value === "object" && "ciphertext" in value) {
        expect("blob" in value).toBe(false);
      }
    }
  });

  it("CryptoKey não persistível resulta em SECURE_SPOOL_UNAVAILABLE sem raw key", async () => {
    const keyPuts: unknown[] = [];
    const exportSpy = vi.spyOn(crypto.subtle, "exportKey");
    const indexedDb = createMemoryIndexedDb({
      persistCryptoKey: false,
      onPut: (storeName, value) => {
        if (storeName === "keys") {
          keyPuts.push(value);
        }
      },
    });
    const spool = await createSessionAudioSpool({ indexedDb, subtle: crypto.subtle });
    expect(spool.status).toBe("SECURE_SPOOL_UNAVAILABLE");
    expect(await spool.put(sampleChunk())).toBe(false);
    expect(keyPuts.some((value) => value instanceof ArrayBuffer)).toBe(false);
    expect(exportSpy).not.toHaveBeenCalled();
    exportSpy.mockRestore();
  });

  it("reload com CryptoKey válida descriptografa o chunk", async () => {
    const indexedDb = createMemoryIndexedDb({ persistCryptoKey: true });
    const first = await createSessionAudioSpool({ indexedDb, subtle: crypto.subtle });
    expect(first.status).toBe("available");
    expect(await first.put(sampleChunk())).toBe(true);
    expect(
      await first.count(
        "11111111-1111-4111-8111-111111111111",
        "33333333-3333-4333-8333-333333333333",
      ),
    ).toBe(1);
    expect(
      await first.take(
        "11111111-1111-4111-8111-111111111111",
        "33333333-3333-4333-8333-333333333333",
      ),
    ).toHaveLength(1);

    const second = await createSessionAudioSpool({ indexedDb, subtle: crypto.subtle });
    expect(second.status).toBe("available");
    const recovered = await second.take(
      "11111111-1111-4111-8111-111111111111",
      "33333333-3333-4333-8333-333333333333",
    );
    expect(recovered).toHaveLength(1);
    expect(recovered[0]?.mimeType).toBe("audio/webm");
    expect(recovered[0]?.sequence).toBe(0);
    expect(recovered[0]?.chunkId).toBe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  });

  it("ciphertext corrompido falha fechado e não devolve áudio", async () => {
    const chunkPuts: Array<{ ciphertext: ArrayBuffer }> = [];
    const indexedDb = createMemoryIndexedDb({
      persistCryptoKey: true,
      onPut: (storeName, value) => {
        if (storeName === "chunks" && value && typeof value === "object" && "ciphertext" in value) {
          chunkPuts.push(value as { ciphertext: ArrayBuffer });
        }
      },
    });
    const spool = await createSessionAudioSpool({ indexedDb, subtle: crypto.subtle });
    expect(await spool.put(sampleChunk())).toBe(true);
    expect(chunkPuts).toHaveLength(1);
    chunkPuts[0]!.ciphertext = new Uint8Array([1, 2, 3]).buffer;
    const recovered = await spool.take(
      "11111111-1111-4111-8111-111111111111",
      "33333333-3333-4333-8333-333333333333",
    );
    expect(recovered).toHaveLength(0);
    expect(
      await spool.count(
        "11111111-1111-4111-8111-111111111111",
        "33333333-3333-4333-8333-333333333333",
      ),
    ).toBe(1);
  });

  it("o módulo do spool não exporta chave AES em raw para persistir", () => {
    const source = readFileSync("src/features/sessions/transcription/session-audio-spool.ts", "utf8");
    expect(source).not.toMatch(/exportKey\(\s*["']raw["']/);
    expect(source).not.toContain("persistRawAesKey");
  });
});

import type { AudioChunk } from "@/features/sessions/transcription/audio-chunk";
import { SPOOL_CRYPTO_VERSION } from "@/features/sessions/transcription/constants";
import {
  decryptBytes,
  encryptBytes,
  generateAesGcmKey,
  probeIndexedDb,
  probeWebCryptoAesGcm,
  type SecureSpoolStatus,
} from "@/features/sessions/transcription/spool-crypto";

const DB_NAME = "virginia-psi-audio-spool";
const DB_VERSION = 1;
const CHUNKS_STORE = "chunks";
const KEYS_STORE = "keys";
const KEY_RECORD_ID = "session-audio";

export type SpoolRecord = {
  chunkId: string;
  organizationId: string;
  sessionId: string;
  sequence: number;
  startMs: number;
  endMs: number;
  mimeType: string;
  ciphertext: ArrayBuffer;
  iv: ArrayBuffer;
  cryptoVersion: number;
  createdAt: number;
  retryCount: number;
};

export type SessionAudioSpool = {
  status: SecureSpoolStatus;
  put: (chunk: AudioChunk) => Promise<boolean>;
  take: (organizationId: string, sessionId: string) => Promise<AudioChunk[]>;
  delete: (chunkId: string) => Promise<void>;
  count: (organizationId: string, sessionId: string) => Promise<number>;
};

function openDb(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(CHUNKS_STORE)) {
        db.createObjectStore(CHUNKS_STORE, { keyPath: "chunkId" });
      }
      if (!db.objectStoreNames.contains(KEYS_STORE)) {
        db.createObjectStore(KEYS_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("indexeddb_open_failed"));
  });
}

function idbRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("indexeddb_request_failed"));
  });
}

async function persistSpoolKey(db: IDBDatabase, key: CryptoKey, subtle: SubtleCrypto): Promise<boolean> {
  try {
    const tx = db.transaction(KEYS_STORE, "readwrite");
    tx.objectStore(KEYS_STORE).put(key, KEY_RECORD_ID);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("indexeddb_put_key_failed"));
    });
    const readTx = db.transaction(KEYS_STORE, "readonly");
    const stored = await idbRequest(readTx.objectStore(KEYS_STORE).get(KEY_RECORD_ID));
    if (!(stored instanceof CryptoKey)) {
      return false;
    }
    const probe = new TextEncoder().encode("virginia-psi-spool-probe");
    const { iv, ciphertext } = await encryptBytes(stored, probe, subtle);
    const decrypted = await decryptBytes(
      stored,
      new Uint8Array(iv),
      new Uint8Array(ciphertext),
      subtle,
    );
    return new TextDecoder().decode(decrypted) === "virginia-psi-spool-probe";
  } catch {
    return false;
  }
}

async function loadSpoolKey(db: IDBDatabase): Promise<CryptoKey | null> {
  try {
    const tx = db.transaction(KEYS_STORE, "readonly");
    const stored = await idbRequest(tx.objectStore(KEYS_STORE).get(KEY_RECORD_ID));
    if (stored instanceof CryptoKey) {
      return stored;
    }
    return null;
  } catch {
    return null;
  }
}

function recordToChunk(record: SpoolRecord, blob: Blob): AudioChunk {
  return {
    chunkId: record.chunkId,
    sequence: record.sequence,
    sessionId: record.sessionId,
    organizationId: record.organizationId,
    blob,
    mimeType: record.mimeType,
    startMs: record.startMs,
    endMs: record.endMs,
    createdAt: record.createdAt,
    retryCount: record.retryCount,
    state: "spooled",
  };
}

export async function createSessionAudioSpool(
  options: {
    indexedDb?: IDBFactory;
    subtle?: SubtleCrypto;
  } = {},
): Promise<SessionAudioSpool> {
  const indexedDb = options.indexedDb ?? globalThis.indexedDB;
  const subtle = options.subtle ?? globalThis.crypto?.subtle;
  const cryptoOk = await probeWebCryptoAesGcm(subtle);
  const idbOk = await probeIndexedDb(indexedDb);

  const unavailable = (status: SecureSpoolStatus): SessionAudioSpool => ({
    status,
    async put() {
      return false;
    },
    async take() {
      return [];
    },
    async delete() {},
    async count() {
      return 0;
    },
  });

  if (!cryptoOk) {
    return unavailable("SECURE_SPOOL_UNAVAILABLE");
  }
  if (!idbOk || !indexedDb || !subtle) {
    return unavailable("storage_unavailable");
  }

  let db: IDBDatabase;
  try {
    db = await openDb(indexedDb);
  } catch {
    return unavailable("storage_unavailable");
  }

  let key = await loadSpoolKey(db);
  if (!key) {
    const nonExtractable = await generateAesGcmKey(subtle);
    if (!(await persistSpoolKey(db, nonExtractable, subtle))) {
      db.close();
      return unavailable("SECURE_SPOOL_UNAVAILABLE");
    }
    key = (await loadSpoolKey(db)) ?? nonExtractable;
  }

  const spoolKey = key;

  return {
    status: "available",
    async put(chunk) {
      try {
        const plaintext = new Uint8Array(await chunk.blob.arrayBuffer());
        const { iv, ciphertext } = await encryptBytes(spoolKey, plaintext, subtle);
        const record: SpoolRecord = {
          chunkId: chunk.chunkId,
          organizationId: chunk.organizationId,
          sessionId: chunk.sessionId,
          sequence: chunk.sequence,
          startMs: chunk.startMs,
          endMs: chunk.endMs,
          mimeType: chunk.mimeType,
          ciphertext,
          iv: iv.slice().buffer as ArrayBuffer,
          cryptoVersion: SPOOL_CRYPTO_VERSION,
          createdAt: chunk.createdAt,
          retryCount: chunk.retryCount,
        };
        const tx = db.transaction(CHUNKS_STORE, "readwrite");
        tx.objectStore(CHUNKS_STORE).put(record);
        await new Promise<void>((resolve, reject) => {
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error ?? new Error("indexeddb_put_chunk_failed"));
        });
        return true;
      } catch {
        return false;
      }
    },
    async take(organizationId, sessionId) {
      const tx = db.transaction(CHUNKS_STORE, "readonly");
      const records = (await idbRequest(
        tx.objectStore(CHUNKS_STORE).getAll(),
      )) as SpoolRecord[];
      const matching = records
        .filter(
          (record) =>
            record.organizationId === organizationId && record.sessionId === sessionId,
        )
        .sort((a, b) => a.sequence - b.sequence);

      const chunks: AudioChunk[] = [];
      for (const record of matching) {
        try {
          const plaintext = await decryptBytes(
            spoolKey,
            new Uint8Array(record.iv),
            new Uint8Array(record.ciphertext),
            subtle,
          );
          chunks.push(
            recordToChunk(record, new Blob([new Uint8Array(plaintext)], { type: record.mimeType })),
          );
        } catch {
          // Corrupt ciphertext stays until an explicit delete after a failed
          // recovery attempt is surfaced to the user.
        }
      }
      return chunks;
    },
    async delete(chunkId) {
      const tx = db.transaction(CHUNKS_STORE, "readwrite");
      tx.objectStore(CHUNKS_STORE).delete(chunkId);
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error("indexeddb_delete_failed"));
      });
    },
    async count(organizationId, sessionId) {
      const tx = db.transaction(CHUNKS_STORE, "readonly");
      const records = (await idbRequest(
        tx.objectStore(CHUNKS_STORE).getAll(),
      )) as SpoolRecord[];
      return records.filter(
        (record) =>
          record.organizationId === organizationId && record.sessionId === sessionId,
      ).length;
    },
  };
}

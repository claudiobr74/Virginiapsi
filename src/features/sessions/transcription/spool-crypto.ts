export type SecureSpoolStatus =
  | "available"
  | "SECURE_SPOOL_UNAVAILABLE"
  | "storage_unavailable";

export async function probeWebCryptoAesGcm(
  subtle: SubtleCrypto | undefined = globalThis.crypto?.subtle,
): Promise<boolean> {
  if (!subtle?.generateKey || !subtle.encrypt || !subtle.decrypt) {
    return false;
  }
  try {
    const key = await subtle.generateKey({ name: "AES-GCM", length: 256 }, false, [
      "encrypt",
      "decrypt",
    ]);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      new TextEncoder().encode("probe"),
    );
    const decrypted = await subtle.decrypt({ name: "AES-GCM", iv }, key, encrypted);
    return new TextDecoder().decode(decrypted) === "probe";
  } catch {
    return false;
  }
}

export async function probeIndexedDb(
  indexedDb: IDBFactory | undefined = globalThis.indexedDB,
): Promise<boolean> {
  if (!indexedDb?.open) {
    return false;
  }
  return new Promise((resolve) => {
    try {
      const request = indexedDb.open("virginia-psi-spool-probe", 1);
      request.onerror = () => resolve(false);
      request.onsuccess = () => {
        request.result.close();
        resolve(true);
      };
    } catch {
      resolve(false);
    }
  });
}

export async function readStorageEstimate(
  storage: Pick<StorageManager, "estimate"> | undefined = navigator.storage,
): Promise<{ usage: number; quota: number } | null> {
  try {
    const estimate = await storage?.estimate();
    if (!estimate?.quota) {
      return null;
    }
    return { usage: estimate.usage ?? 0, quota: estimate.quota };
  } catch {
    return null;
  }
}

export async function requestPersistentStorage(
  storage: Pick<StorageManager, "persist"> | undefined = navigator.storage,
): Promise<boolean | null> {
  if (typeof storage?.persist !== "function") {
    return null;
  }
  try {
    return await storage.persist();
  } catch {
    return false;
  }
}

export async function generateAesGcmKey(
  subtle: SubtleCrypto = crypto.subtle,
): Promise<CryptoKey> {
  return subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

export async function encryptBytes(
  key: CryptoKey,
  plaintext: BufferSource,
  subtle: SubtleCrypto = crypto.subtle,
): Promise<{ iv: Uint8Array; ciphertext: ArrayBuffer }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
  return { iv, ciphertext };
}

export async function decryptBytes(
  key: CryptoKey,
  iv: BufferSource,
  ciphertext: BufferSource,
  subtle: SubtleCrypto = crypto.subtle,
): Promise<ArrayBuffer> {
  return subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
}

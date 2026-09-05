const LOCK_NAME_PREFIX = "virginia-psi-session-capture:";

export type CaptureLock = {
  release: () => Promise<void>;
};

/**
 * Prefer Web Locks. Fall back to an IndexedDB heartbeat lease so Safari
 * without Web Locks still cannot run two captures of the same session.
 */
export async function acquireSessionCaptureLock(
  sessionId: string,
): Promise<CaptureLock | null> {
  const lockName = `${LOCK_NAME_PREFIX}${sessionId}`;
  if ("locks" in navigator && navigator.locks) {
    return acquireWebLock(lockName, navigator.locks);
  }
  return acquireIndexedDbLease(lockName);
}

function acquireWebLock(
  lockName: string,
  webLocks: LockManager,
): Promise<CaptureLock | null> {
  return new Promise((resolve) => {
    let settled = false;
    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve(null);
      }
    }, 400);

    void webLocks.request(lockName, { mode: "exclusive", ifAvailable: true }, async (lock) => {
      clearTimeout(timeout);
      if (!lock) {
        if (!settled) {
          settled = true;
          resolve(null);
        }
        return;
      }
      await new Promise<void>((releaseLock) => {
        if (!settled) {
          settled = true;
          resolve({
            async release() {
              releaseLock();
            },
          });
        }
      });
    });
  });
}

async function acquireIndexedDbLease(lockName: string): Promise<CaptureLock | null> {
  if (!indexedDB?.open) {
    return {
      async release() {},
    };
  }

  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("virginia-psi-capture-lease", 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("leases")) {
        request.result.createObjectStore("leases");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("lease_db"));
  });

  const owner = crypto.randomUUID();
  const now = Date.now();
  const existing = await new Promise<{ owner: string; heartbeat: number } | undefined>(
    (resolve, reject) => {
      const tx = db.transaction("leases", "readonly");
      const request = tx.objectStore("leases").get(lockName);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    },
  );

  if (existing && existing.owner !== owner && now - existing.heartbeat < 8_000) {
    db.close();
    return null;
  }

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("leases", "readwrite");
    tx.objectStore("leases").put({ owner, heartbeat: now }, lockName);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  const heartbeat = setInterval(() => {
    const tx = db.transaction("leases", "readwrite");
    tx.objectStore("leases").put({ owner, heartbeat: Date.now() }, lockName);
  }, 2_000);

  return {
    async release() {
      clearInterval(heartbeat);
      await new Promise<void>((resolve) => {
        const tx = db.transaction("leases", "readwrite");
        const getRequest = tx.objectStore("leases").get(lockName);
        getRequest.onsuccess = () => {
          const current = getRequest.result as { owner?: string } | undefined;
          if (current?.owner === owner) {
            tx.objectStore("leases").delete(lockName);
          }
        };
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
      db.close();
    },
  };
}

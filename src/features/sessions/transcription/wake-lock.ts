export type WakeLockHandle = {
  release: () => Promise<void>;
};

/** Progressive enhancement. Missing API must not break capture. */
export async function requestScreenWakeLock(): Promise<WakeLockHandle | null> {
  const nav = navigator as Navigator & {
    wakeLock?: { request: (type: "screen") => Promise<{ release: () => Promise<void> }> };
  };
  if (typeof nav.wakeLock?.request !== "function") {
    return null;
  }
  try {
    const sentinel = await nav.wakeLock.request("screen");
    return {
      async release() {
        await sentinel.release().catch(() => undefined);
      },
    };
  } catch {
    return null;
  }
}

export function subscribeVisibility(
  onHidden: () => void,
  onVisible: () => void,
): () => void {
  const handler = () => {
    if (document.visibilityState === "hidden") {
      onHidden();
    } else {
      onVisible();
    }
  };
  document.addEventListener("visibilitychange", handler);
  return () => document.removeEventListener("visibilitychange", handler);
}

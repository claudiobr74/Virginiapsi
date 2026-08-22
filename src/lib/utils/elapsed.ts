/**
 * Elapsed-time helpers for the active clinical session chrome.
 * Duration is always derived from real timestamps — never a decorative clock.
 */

export function elapsedSecondsBetween(startIso: string, endIso: string): number {
  const start = Date.parse(startIso);
  const end = Date.parse(endIso);
  if (Number.isNaN(start) || Number.isNaN(end)) {
    return 0;
  }
  return Math.max(0, Math.floor((end - start) / 1000));
}

export function formatElapsedHms(totalSeconds: number): string {
  const clamped = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(clamped / 3600);
  const minutes = Math.floor((clamped % 3600) / 60);
  const seconds = clamped % 60;
  return [hours, minutes, seconds]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");
}

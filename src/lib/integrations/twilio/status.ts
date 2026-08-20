const STATUS_RANK: Record<string, number> = {
  accepted: 0,
  queued: 1,
  sending: 2,
  sent: 3,
  delivered: 4,
  read: 5,
  undelivered: 6,
  failed: 6,
};

/**
 * Twilio status callbacks may arrive out of order. Never regress a
 * delivered/read message back to sent/queued. Terminal failure states
 * (failed/undelivered) may overwrite in-flight states.
 */
export function shouldApplyTwilioStatus(current: string | null | undefined, next: string): boolean {
  if (!current) {
    return true;
  }
  if (current === next) {
    return false;
  }
  const currentRank = STATUS_RANK[current] ?? -1;
  const nextRank = STATUS_RANK[next] ?? -1;
  if (next === "failed" || next === "undelivered") {
    return currentRank < 4;
  }
  return nextRank > currentRank;
}

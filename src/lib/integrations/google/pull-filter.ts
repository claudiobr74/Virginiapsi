/**
 * Pull ownership rules (explicit MVP decision):
 * - TESSELI appointments are owned by VirgíniaPsi. Pull never upserts them as
 *   GOOGLE_EXTERNAL (the unique key is already occupied by the pushed event).
 * - GOOGLE_EXTERNAL appointments are owned by Google. Pull updates/cancels them.
 * - A cancelled Google event that was never imported is ignored (no ghost row).
 */
export function shouldUpsertExternalGoogleEvent(
  googleEventId: string,
  cancelled: boolean,
  managedGoogleEventIds: ReadonlySet<string>,
  knownExternalEventIds: ReadonlySet<string>,
): boolean {
  if (managedGoogleEventIds.has(googleEventId)) {
    return false;
  }
  if (cancelled && !knownExternalEventIds.has(googleEventId)) {
    return false;
  }
  return true;
}

export function managedEventCancelIsConflict(
  cancelledOnGoogle: boolean,
  localStatus: string | undefined,
): boolean {
  return Boolean(cancelledOnGoogle && localStatus && localStatus !== "cancelled");
}

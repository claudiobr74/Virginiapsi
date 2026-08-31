/**
 * When a Tesseli-managed appointment must be pushed again.
 * Cancel must leave `not_synced` (or `error`); a leftover `synced` after a
 * local cancel would skip the Google `status=cancelled` PATCH on reconnect.
 */
export function tesseliAppointmentNeedsGooglePush(row: {
  sync_status: string | null | undefined;
  status: string | null | undefined;
  google_event_id?: string | null;
}): boolean {
  return (
    row.sync_status === "not_synced" ||
    row.sync_status === "error" ||
    (row.status === "cancelled" &&
      Boolean(row.google_event_id) &&
      row.sync_status !== "synced")
  );
}

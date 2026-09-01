import type { AppointmentStatus } from "@/features/calendar/contracts";

const CANCELLATION_MARKERS = [
  "(desmarcou)",
  "desmarcou",
  "desmarcada",
  "desmarcado",
  "cancelou",
  "cancelada",
  "cancelado",
] as const;

export interface AppointmentCancellationInput {
  status: AppointmentStatus;
  summary_snapshot?: string | null;
  summarySnapshot?: string | null;
  google_color_id?: string | null;
  googleColorId?: string | null;
  google_event_type?: string | null;
  googleEventType?: string | null;
  cancelled_google_color_ids?: readonly string[] | null;
  cancelledGoogleColorIds?: readonly string[] | null;
}

/**
 * Deterministic title classifier. Reads the Google/VirginiaPsi summary
 * without rewriting it. "(c)" is not a cancellation marker.
 * Do not add clinic slang like "plantão", "não pode" or "?" here.
 */
export function summaryIndicatesCancellation(
  summary: string | null | undefined,
): boolean {
  const normalized = (summary ?? "").toLocaleLowerCase("pt-BR");
  if (!normalized) {
    return false;
  }
  return CANCELLATION_MARKERS.some((marker) => normalized.includes(marker));
}

export function normalizeCancelledGoogleColorIds(
  colorIds: readonly string[] | null | undefined,
): string[] {
  const unique = new Set<string>();
  for (const value of colorIds ?? []) {
    const trimmed = value.trim();
    if (/^[0-9]{1,4}$/.test(trimmed)) {
      unique.add(trimmed);
    }
  }
  return [...unique];
}

export function persistedGoogleEventType(
  eventType: string | null | undefined,
): string | null {
  const trimmed = (eventType ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Color-map cancellation applies only to default (or still-unobserved) events. */
export function isDefaultGoogleEventType(eventType: string | null | undefined): boolean {
  const trimmed = (eventType ?? "").trim();
  return trimmed.length === 0 || trimmed === "default";
}

export function colorIdIndicatesCancellation(
  colorId: string | null | undefined,
  cancelledColorIds: readonly string[] | null | undefined,
  eventType?: string | null,
): boolean {
  if (!isDefaultGoogleEventType(eventType)) {
    return false;
  }
  const id = (colorId ?? "").trim();
  if (!id) {
    return false;
  }
  return normalizeCancelledGoogleColorIds(cancelledColorIds).includes(id);
}

export function applyOrgCancelledColorPolicy<T extends object>(
  rows: T[],
  cancelledColorIds: readonly string[] | null | undefined,
): Array<T & { cancelled_google_color_ids: string[] }> {
  const ids = normalizeCancelledGoogleColorIds(cancelledColorIds);
  return rows.map((row) => ({ ...row, cancelled_google_color_ids: ids }));
}

export function isAppointmentCancelled(appointment: AppointmentCancellationInput): boolean {
  if (appointment.status === "cancelled" || appointment.status === "no_show") {
    return true;
  }
  const summary = appointment.summary_snapshot ?? appointment.summarySnapshot ?? null;
  if (summaryIndicatesCancellation(summary)) {
    return true;
  }
  return colorIdIndicatesCancellation(
    appointment.google_color_id ?? appointment.googleColorId,
    appointment.cancelled_google_color_ids ?? appointment.cancelledGoogleColorIds,
    appointment.google_event_type ?? appointment.googleEventType,
  );
}

/** Valid countable session: not cancelled / no_show / desmarcou / org cancelled color. Origin ignored. */
export function isValidCountableSession(appointment: AppointmentCancellationInput): boolean {
  return !isAppointmentCancelled(appointment);
}

export function countValidAgendaSessions<T extends AppointmentCancellationInput>(
  appointments: T[],
): number {
  return appointments.filter(isValidCountableSession).length;
}

export function deriveImportedAppointmentStatus(
  event: {
    status?: string;
    summary?: string;
    colorId?: string | null;
    eventType?: string | null;
  },
  options?: { cancelledColorIds?: readonly string[] | null },
): AppointmentStatus {
  if (event.status === "cancelled") {
    return "cancelled";
  }
  if (summaryIndicatesCancellation(event.summary)) {
    return "cancelled";
  }
  if (
    colorIdIndicatesCancellation(
      event.colorId,
      options?.cancelledColorIds,
      event.eventType,
    )
  ) {
    return "cancelled";
  }
  return "scheduled";
}

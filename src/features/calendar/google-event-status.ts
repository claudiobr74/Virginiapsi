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

/**
 * Deterministic title classifier. Reads the Google/VirginiaPsi summary
 * without rewriting it. "(c)" is not a cancellation marker.
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

export function isAppointmentCancelled(appointment: {
  status: AppointmentStatus;
  summary_snapshot?: string | null;
  summarySnapshot?: string | null;
}): boolean {
  if (appointment.status === "cancelled" || appointment.status === "no_show") {
    return true;
  }
  const summary = appointment.summary_snapshot ?? appointment.summarySnapshot ?? null;
  return summaryIndicatesCancellation(summary);
}

/** Valid countable session: not cancelled / no_show / desmarcou. Origin ignored. */
export function isValidCountableSession(appointment: {
  status: AppointmentStatus;
  summary_snapshot?: string | null;
  summarySnapshot?: string | null;
}): boolean {
  return !isAppointmentCancelled(appointment);
}

export function countValidAgendaSessions<
  T extends {
    status: AppointmentStatus;
    summary_snapshot?: string | null;
    summarySnapshot?: string | null;
  },
>(appointments: T[]): number {
  return appointments.filter(isValidCountableSession).length;
}

export function deriveImportedAppointmentStatus(event: {
  status?: string;
  summary?: string;
}): AppointmentStatus {
  if (event.status === "cancelled" || summaryIndicatesCancellation(event.summary)) {
    return "cancelled";
  }
  return "scheduled";
}

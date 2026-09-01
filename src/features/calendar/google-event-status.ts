import type { AppointmentOrigin, AppointmentStatus } from "@/features/calendar/contracts";

const CANCELLATION_MARKERS = [
  "(desmarcou)",
  "desmarcou",
  "desmarcada",
  "desmarcado",
  "cancelou",
  "cancelada",
  "cancelado",
] as const;

export type AppointmentSemanticState =
  | "active"
  | "completed"
  | "cancelled"
  | "unavailable"
  | "deleted";

export interface AppointmentCancellationInput {
  status: AppointmentStatus;
  origin?: AppointmentOrigin;
  summary_snapshot?: string | null;
  summarySnapshot?: string | null;
  google_color_id?: string | null;
  googleColorId?: string | null;
  google_event_type?: string | null;
  googleEventType?: string | null;
  google_deleted_at?: string | null;
  googleDeletedAt?: string | null;
  cancelled_google_color_ids?: readonly string[] | null;
  cancelledGoogleColorIds?: readonly string[] | null;
  unavailable_google_color_ids?: readonly string[] | null;
  unavailableGoogleColorIds?: readonly string[] | null;
  ends_at?: string;
  endsAt?: string;
}

/**
 * Deterministic title classifier. Reads the Google/VirginiaPsi summary
 * without rewriting it. "(c)" is not a cancellation marker.
 * Do not add clinic slang like "plantão", "não pode", "viajando" or "?" here.
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

export function normalizeGoogleColorIds(
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

/** @deprecated Legacy cancelled color map. Prefer normalizeGoogleColorIds / unavailable. */
export function normalizeCancelledGoogleColorIds(
  colorIds: readonly string[] | null | undefined,
): string[] {
  return normalizeGoogleColorIds(colorIds);
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

/**
 * Legacy helper. ColorId is not a clinical cancellation by itself.
 * Kept so existing V2.1 tests of the unused map stay explicit about deprecation.
 */
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
  return normalizeGoogleColorIds(cancelledColorIds).includes(id);
}

export function colorIdIndicatesUnavailability(
  colorId: string | null | undefined,
  unavailableColorIds: readonly string[] | null | undefined,
): boolean {
  const id = (colorId ?? "").trim();
  if (!id) {
    return false;
  }
  return normalizeGoogleColorIds(unavailableColorIds).includes(id);
}

export function applyOrgCancelledColorPolicy<T extends object>(
  rows: T[],
  cancelledColorIds: readonly string[] | null | undefined,
): Array<T & { cancelled_google_color_ids: string[] }> {
  const ids = normalizeGoogleColorIds(cancelledColorIds);
  return rows.map((row) => ({ ...row, cancelled_google_color_ids: ids }));
}

export function applyOrgUnavailableColorPolicy<T extends object>(
  rows: T[],
  unavailableColorIds: readonly string[] | null | undefined,
): Array<T & { unavailable_google_color_ids: string[] }> {
  const ids = normalizeGoogleColorIds(unavailableColorIds);
  return rows.map((row) => ({ ...row, unavailable_google_color_ids: ids }));
}

export function applyOrgAgendaColorPolicies<T extends object>(
  rows: T[],
  connection: {
    cancelled_google_color_ids?: readonly string[] | null;
    unavailable_google_color_ids?: readonly string[] | null;
  } | null | undefined,
): Array<T & { cancelled_google_color_ids: string[]; unavailable_google_color_ids: string[] }> {
  return applyOrgUnavailableColorPolicy(
    applyOrgCancelledColorPolicy(rows, connection?.cancelled_google_color_ids),
    connection?.unavailable_google_color_ids,
  );
}

export function isAppointmentCancelled(appointment: AppointmentCancellationInput): boolean {
  if (appointment.status === "cancelled" || appointment.status === "no_show") {
    return true;
  }
  const summary = appointment.summary_snapshot ?? appointment.summarySnapshot ?? null;
  return summaryIndicatesCancellation(summary);
}

function googleDeletedAtOf(appointment: AppointmentCancellationInput): string | null {
  return appointment.google_deleted_at ?? appointment.googleDeletedAt ?? null;
}

function endsAtOf(appointment: AppointmentCancellationInput): string {
  return appointment.ends_at ?? appointment.endsAt ?? "";
}

/**
 * Canonical Agenda/Meu Dia semantic state.
 * Precedence: deleted → cancelled (status/text) → unavailable (org color map) → completed → active.
 * ColorId never writes clinical status. eventType is not used to disambiguate color.
 */
export function getAppointmentSemanticState(
  appointment: AppointmentCancellationInput,
  now: Date = new Date(),
): AppointmentSemanticState {
  if (googleDeletedAtOf(appointment)) {
    return "deleted";
  }
  if (isAppointmentCancelled(appointment)) {
    return "cancelled";
  }
  if (
    appointment.origin === "GOOGLE_EXTERNAL" &&
    colorIdIndicatesUnavailability(
      appointment.google_color_id ?? appointment.googleColorId,
      appointment.unavailable_google_color_ids ?? appointment.unavailableGoogleColorIds,
    )
  ) {
    return "unavailable";
  }
  const endsMs = new Date(endsAtOf(appointment)).getTime();
  if (Number.isFinite(endsMs) && endsMs <= now.getTime()) {
    return "completed";
  }
  return "active";
}

export function isRenderedAgendaAppointment(
  appointment: AppointmentCancellationInput,
): boolean {
  return getAppointmentSemanticState(appointment) !== "deleted";
}

/** Countable session: active or completed. Same helper as presentation. */
export function isValidCountableSession(appointment: AppointmentCancellationInput): boolean {
  const state = getAppointmentSemanticState(appointment);
  return state === "active" || state === "completed";
}

export function countValidAgendaSessions<T extends AppointmentCancellationInput>(
  appointments: T[],
): number {
  return appointments.filter(isValidCountableSession).length;
}

export function deriveImportedAppointmentStatus(event: {
  status?: string;
  summary?: string;
  colorId?: string | null;
  eventType?: string | null;
}): AppointmentStatus {
  if (summaryIndicatesCancellation(event.summary)) {
    return "cancelled";
  }
  return "scheduled";
}

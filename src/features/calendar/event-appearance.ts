import { type AppointmentRow, type AppointmentStatus } from "@/features/calendar/contracts";
import { formatInTimeZone } from "@/lib/utils/timezone";
import { MODALITY_LABELS } from "@/features/patients/contracts";

/**
 * Visual tone of an Agenda block. Clinical semantics (VirgíniaPsi):
 * green = still happening, blue = already done, soft red = cancelled.
 * Google-imported events without a clinical appointment stay neutral.
 */
export type CalendarEventTone =
  | "active"
  | "completed"
  | "cancelled"
  | "external"
  | "noshow";

export const CALENDAR_LEGEND_ITEMS: ReadonlyArray<{
  tone: Extract<CalendarEventTone, "active" | "completed" | "cancelled">;
  label: string;
}> = [
  { tone: "active", label: "Ativo" },
  { tone: "completed", label: "Realizado" },
  { tone: "cancelled", label: "Cancelado" },
];

const TONE_SURFACE: Record<CalendarEventTone, string> = {
  active: "bg-cal-active text-cal-active-fg hover:bg-cal-active-hover",
  completed: "bg-cal-completed text-cal-completed-fg hover:bg-cal-completed-hover",
  cancelled: "bg-cal-cancelled text-cal-cancelled-fg hover:bg-cal-cancelled-hover",
  external: "bg-cal-external text-cal-external-fg hover:bg-cal-external-hover",
  noshow: "bg-cal-noshow text-cal-noshow-fg hover:bg-cal-noshow-hover",
};

export function calendarEventTone(
  appointment: Pick<AppointmentRow, "origin" | "status">,
): CalendarEventTone {
  if (appointment.origin === "GOOGLE_EXTERNAL") {
    return "external";
  }
  return toneForStatus(appointment.status);
}

export function toneForStatus(status: string): CalendarEventTone {
  switch (normalizeStatusToken(status)) {
    case "completed":
    case "finished":
      return "completed";
    case "cancelled":
    case "canceled":
      return "cancelled";
    case "no_show":
    case "noshow":
      return "noshow";
    case "scheduled":
    case "confirmed":
    case "pending":
    default:
      return "active";
  }
}

function normalizeStatusToken(status: string): string {
  return status.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

export function calendarEventSurfaceClass(tone: CalendarEventTone): string {
  return TONE_SURFACE[tone];
}

export function calendarEventTitle(
  appointment: Pick<AppointmentRow, "summary_snapshot">,
): string {
  return appointment.summary_snapshot?.trim() || "Sem paciente vinculado";
}

/** Compact labels used inside Agenda blocks (color remains the primary cue). */
export function calendarStatusLabel(
  appointment: Pick<AppointmentRow, "origin" | "status">,
): string {
  if (appointment.origin === "GOOGLE_EXTERNAL") {
    return "Evento externo do Google";
  }
  switch (appointment.status as AppointmentStatus) {
    case "scheduled":
      return "Agendado";
    case "confirmed":
      return "Confirmado";
    case "completed":
      return "Realizado";
    case "cancelled":
      return "Cancelado";
    case "no_show":
      return "Faltou";
    default:
      return "Agendado";
  }
}

export function calendarEventAriaLabel(
  appointment: Pick<
    AppointmentRow,
    "origin" | "status" | "summary_snapshot" | "starts_at" | "ends_at" | "modality"
  >,
  timeZone: string,
): string {
  const title = calendarEventTitle(appointment);
  const range = formatAgendaTimeRange(appointment.starts_at, appointment.ends_at, timeZone);
  const status = calendarStatusLabel(appointment);
  if (appointment.origin === "GOOGLE_EXTERNAL") {
    return `${title}, ${range}, ${status}`;
  }
  return `${title}, ${range}, ${status}, ${MODALITY_LABELS[appointment.modality]}`;
}

export function formatAgendaTimeRange(
  startsAt: string,
  endsAt: string,
  timeZone: string,
): string {
  const start = formatInTimeZone(startsAt, timeZone);
  const end = formatInTimeZone(endsAt, timeZone);
  return `${start}–${end}`;
}

export function isCancelledAppointment(
  appointment: Pick<AppointmentRow, "origin" | "status">,
): boolean {
  return (
    appointment.origin !== "GOOGLE_EXTERNAL" &&
    calendarEventTone(appointment) === "cancelled"
  );
}

export function legendDotClass(
  tone: Extract<CalendarEventTone, "active" | "completed" | "cancelled">,
): string {
  if (tone === "active") return "bg-cal-active";
  if (tone === "completed") return "bg-cal-completed";
  return "bg-cal-cancelled";
}

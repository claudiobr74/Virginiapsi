import type { AppointmentRow } from "@/features/calendar/contracts";
import {
  isRenderedAgendaAppointment,
  isValidCountableSession,
} from "@/features/calendar/google-event-status";

const FALLBACK_TIME_ZONE = "America/Sao_Paulo";

function capitalizePt(value: string): string {
  if (!value) {
    return value;
  }
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function formatAgendaLongDate(
  isoDate: string,
  timeZone = FALLBACK_TIME_ZONE,
): string {
  const formatted = new Intl.DateTimeFormat("pt-BR", {
    timeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${isoDate}T12:00:00`));
  return capitalizePt(formatted);
}

export function formatAgendaMonthLabel(
  isoDate: string,
  timeZone = FALLBACK_TIME_ZONE,
): string {
  return capitalizePt(
    new Intl.DateTimeFormat("pt-BR", {
      timeZone,
      month: "long",
      year: "numeric",
    }).format(new Date(`${isoDate}T12:00:00`)),
  );
}

export function hourInTimeZone(iso: string, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  return Number.isFinite(hour) ? hour : 0;
}

export function formatHourLabel(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

export function buildDayTimelineHours(
  appointments: Pick<AppointmentRow, "starts_at">[],
  timeZone: string,
  startHour = 7,
  endHour = 20,
): number[] {
  const hours = new Set<number>();
  for (let hour = startHour; hour <= endHour; hour += 1) {
    hours.add(hour);
  }
  for (const appointment of appointments) {
    hours.add(hourInTimeZone(appointment.starts_at, timeZone));
  }
  return [...hours].sort((left, right) => left - right);
}

export function summarizeDayAppointments(appointments: AppointmentRow[]) {
  const valid = appointments.filter(isValidCountableSession);
  return {
    total: valid.length,
    confirmed: valid.filter((appointment) => appointment.status === "confirmed").length,
    scheduled: valid.filter((appointment) => appointment.status === "scheduled").length,
    external: valid.filter((appointment) => appointment.origin === "GOOGLE_EXTERNAL").length,
  };
}

export function googleConnectionIsLive(
  connection: { status: string } | null | undefined,
): boolean {
  return connection?.status === "connected" || connection?.status === "error";
}

/**
 * Shared Agenda + Meu Dia visibility.
 * Connected (or error) → TESSELI + GOOGLE_EXTERNAL.
 * Disconnected / absent → TESSELI only.
 */
export function visibleAppointments<
  T extends {
    origin: AppointmentRow["origin"];
    status?: AppointmentRow["status"];
    summary_snapshot?: string | null;
    summarySnapshot?: string | null;
    google_deleted_at?: string | null;
    googleDeletedAt?: string | null;
  },
>(
  appointments: T[],
  googleConnectionStatus: { status: string } | null | undefined,
): T[] {
  const scoped = googleConnectionIsLive(googleConnectionStatus)
    ? appointments
    : appointments.filter((appointment) => appointment.origin !== "GOOGLE_EXTERNAL");
  return scoped.filter((appointment) =>
    isRenderedAgendaAppointment({
      status: appointment.status ?? "scheduled",
      origin: appointment.origin,
      summary_snapshot: appointment.summary_snapshot,
      summarySnapshot: appointment.summarySnapshot,
      google_deleted_at: appointment.google_deleted_at,
      googleDeletedAt: appointment.googleDeletedAt,
    }),
  );
}

/** Alias kept for existing Agenda call sites. */
export const visibleAgendaAppointments = visibleAppointments;

export function monthCellStats(appointments: AppointmentRow[]) {
  const valid = appointments.filter(isValidCountableSession);
  return {
    count: valid.length,
    hasOnline: valid.some(
      (appointment) =>
        appointment.origin !== "GOOGLE_EXTERNAL" && appointment.modality === "online",
    ),
    hasInPerson: valid.some(
      (appointment) =>
        appointment.origin !== "GOOGLE_EXTERNAL" &&
        (appointment.modality === "in_person" || appointment.modality === "hybrid"),
    ),
    hasExternal: valid.some((appointment) => appointment.origin === "GOOGLE_EXTERNAL"),
  };
}

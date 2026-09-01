import {
  APPOINTMENT_STATUS_LABELS,
  type AppointmentOrigin,
  type AppointmentStatus,
} from "@/features/calendar/contracts";
import {
  getAppointmentSemanticState,
  type AppointmentSemanticState,
} from "@/features/calendar/google-event-status";

export type AppointmentVisualTone = "active" | "completed" | "cancelled" | "unavailable";

export const APPOINTMENT_PRESENTATION_COLORS: Record<
  AppointmentVisualTone,
  { backgroundColor: string; textColor: string }
> = {
  active: { backgroundColor: "#34A853", textColor: "#ffffff" },
  completed: { backgroundColor: "#1A73E8", textColor: "#ffffff" },
  cancelled: { backgroundColor: "#D93025", textColor: "#ffffff" },
  unavailable: { backgroundColor: "#D93025", textColor: "#ffffff" },
};

/** Static class names only — Tailwind must see these strings at build time. */
export const APPOINTMENT_STATUS_STYLES: Record<
  AppointmentVisualTone,
  { tone: AppointmentVisualTone; className: string }
> = {
  active: {
    tone: "active",
    className: "bg-[#34A853] text-white",
  },
  completed: {
    tone: "completed",
    className: "bg-[#1A73E8] text-white",
  },
  cancelled: {
    tone: "cancelled",
    className: "bg-[#D93025] text-white",
  },
  unavailable: {
    tone: "unavailable",
    className: "bg-[#D93025] text-white",
  },
};

export const APPOINTMENT_VISUAL_SURFACE: Record<AppointmentVisualTone, string> = {
  active: APPOINTMENT_STATUS_STYLES.active.className,
  completed: APPOINTMENT_STATUS_STYLES.completed.className,
  cancelled: APPOINTMENT_STATUS_STYLES.cancelled.className,
  unavailable: APPOINTMENT_STATUS_STYLES.unavailable.className,
};

export const APPOINTMENT_VISUAL_DOT: Record<AppointmentVisualTone, string> = {
  active: "bg-[#34A853]",
  completed: "bg-[#1A73E8]",
  cancelled: "bg-[#D93025]",
  unavailable: "bg-[#D93025]",
};

export interface AppointmentPresentationInput {
  status: AppointmentStatus;
  origin?: AppointmentOrigin;
  ends_at?: string;
  endsAt?: string;
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
  patient_id?: string | null;
}

export function myDayAppointmentToPresentationInput(appointment: {
  status: AppointmentStatus;
  origin?: AppointmentOrigin;
  endsAt?: string;
  summarySnapshot?: string | null;
  googleColorId?: string | null;
  googleEventType?: string | null;
  googleDeletedAt?: string | null;
  cancelledGoogleColorIds?: readonly string[] | null;
  unavailableGoogleColorIds?: readonly string[] | null;
  patientId?: string | null;
}): AppointmentPresentationInput {
  return {
    status: appointment.status,
    origin: appointment.origin,
    ends_at: appointment.endsAt,
    summary_snapshot: appointment.summarySnapshot,
    google_color_id: appointment.googleColorId,
    google_event_type: appointment.googleEventType,
    google_deleted_at: appointment.googleDeletedAt,
    cancelled_google_color_ids: appointment.cancelledGoogleColorIds,
    unavailable_google_color_ids: appointment.unavailableGoogleColorIds,
    patient_id: appointment.patientId,
  };
}

export interface AppointmentPresentation {
  visualState: AppointmentVisualTone;
  semanticState: AppointmentSemanticState;
  backgroundColor: string;
  textColor: string;
  badgeLabel: "Google" | null;
  statusLabel: string;
  isPast: boolean;
  isCancelled: boolean;
  isUnavailable: boolean;
  isDeleted: boolean;
}

export interface AppointmentVisualStatus {
  tone: AppointmentVisualTone;
  className: string;
  borderStyle: "solid";
  badge: "Google" | null;
  titleClassName: string;
  dotClassName: string;
  statusLabel: string;
  style: {
    backgroundColor: string;
    borderColor: string;
    color: string;
    borderWidth: number;
    borderStyle: "solid";
  };
}

function endsAtOf(appointment: AppointmentPresentationInput): string {
  return appointment.ends_at ?? appointment.endsAt ?? "";
}

export function appointmentSemanticBadgeLabel(
  state: AppointmentSemanticState,
  status: AppointmentStatus,
): string {
  if (state === "cancelled") {
    return "Cancelado";
  }
  if (state === "unavailable") {
    return "Indisponível";
  }
  if (state === "completed") {
    return "Encerrado";
  }
  if (state === "deleted") {
    return "";
  }
  return APPOINTMENT_STATUS_LABELS[status];
}

function visualToneForSemantic(state: AppointmentSemanticState): AppointmentVisualTone {
  if (state === "deleted") {
    return "cancelled";
  }
  return state;
}

/**
 * Single Agenda/Meu Dia presentation helper.
 * Uses getAppointmentSemanticState. Origin never picks the fill.
 * Past time does not write clinical completed. Deleted events must not render.
 */
export function getAppointmentPresentation(input: {
  appointment: AppointmentPresentationInput;
  now?: Date;
}): AppointmentPresentation {
  const appointment = input.appointment;
  const now = input.now ?? new Date();
  const semanticState = getAppointmentSemanticState(appointment, now);
  const visualState = visualToneForSemantic(semanticState);
  const endsMs = new Date(endsAtOf(appointment)).getTime();
  const isPast = Number.isFinite(endsMs) && endsMs <= now.getTime();
  const palette = APPOINTMENT_PRESENTATION_COLORS[visualState];

  return {
    visualState,
    semanticState,
    backgroundColor: palette.backgroundColor,
    textColor: palette.textColor,
    badgeLabel: appointment.origin === "GOOGLE_EXTERNAL" ? "Google" : null,
    statusLabel: appointmentSemanticBadgeLabel(semanticState, appointment.status),
    isPast,
    isCancelled: semanticState === "cancelled",
    isUnavailable: semanticState === "unavailable",
    isDeleted: semanticState === "deleted",
  };
}

export function getAppointmentVisualStatus(
  appointment: AppointmentPresentationInput,
  now: Date = new Date(),
): AppointmentVisualStatus {
  const presentation = getAppointmentPresentation({ appointment, now });
  const mapped = APPOINTMENT_STATUS_STYLES[presentation.visualState];
  return {
    tone: presentation.visualState,
    className: mapped.className,
    borderStyle: "solid",
    badge: presentation.badgeLabel,
    titleClassName: "",
    dotClassName: APPOINTMENT_VISUAL_DOT[presentation.visualState],
    statusLabel: presentation.statusLabel,
    style: {
      backgroundColor: presentation.backgroundColor,
      borderColor: presentation.backgroundColor,
      color: presentation.textColor,
      borderWidth: 0,
      borderStyle: "solid",
    },
  };
}

export function offersClinicalAppointmentActions(appointment: {
  origin: AppointmentOrigin;
  patient_id: string | null;
  status?: AppointmentStatus;
  summary_snapshot?: string | null;
  summarySnapshot?: string | null;
  google_deleted_at?: string | null;
  google_color_id?: string | null;
  unavailable_google_color_ids?: readonly string[] | null;
}): boolean {
  if (appointment.origin !== "TESSELI" || appointment.patient_id == null) {
    return false;
  }
  const state = getAppointmentSemanticState({
    status: appointment.status ?? "scheduled",
    origin: appointment.origin,
    summary_snapshot: appointment.summary_snapshot,
    summarySnapshot: appointment.summarySnapshot,
    google_deleted_at: appointment.google_deleted_at,
    google_color_id: appointment.google_color_id,
    unavailable_google_color_ids: appointment.unavailable_google_color_ids,
  });
  if (state === "cancelled" || state === "unavailable" || state === "deleted") {
    return false;
  }
  return true;
}

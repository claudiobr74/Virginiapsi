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
  { backgroundColor: string; borderColor: string; accentColor: string; textColor: string }
> = {
  active: {
    backgroundColor: "#EAF6ED",
    borderColor: "#A8D5B2",
    accentColor: "#69A879",
    textColor: "#357047",
  },
  completed: {
    backgroundColor: "#EDF4FC",
    borderColor: "#B5CEE9",
    accentColor: "#7FA8CF",
    textColor: "#416F9E",
  },
  cancelled: {
    backgroundColor: "#FCEEEE",
    borderColor: "#E8B8B5",
    accentColor: "#D28C87",
    textColor: "#A54B46",
  },
  unavailable: {
    backgroundColor: "#FCEEEE",
    borderColor: "#E8B8B5",
    accentColor: "#D28C87",
    textColor: "#A54B46",
  },
};

/** CSS variables — dark mode resolves via :root / .dark. */
export const APPOINTMENT_SURFACE_CSS: Record<
  AppointmentVisualTone,
  { backgroundColor: string; borderColor: string; accentColor: string; textColor: string }
> = {
  active: {
    backgroundColor: "var(--agenda-active-bg)",
    borderColor: "var(--agenda-active-border)",
    accentColor: "var(--agenda-active-accent)",
    textColor: "var(--agenda-active-text)",
  },
  completed: {
    backgroundColor: "var(--agenda-completed-bg)",
    borderColor: "var(--agenda-completed-border)",
    accentColor: "var(--agenda-completed-accent)",
    textColor: "var(--agenda-completed-text)",
  },
  cancelled: {
    backgroundColor: "var(--agenda-unavailable-bg)",
    borderColor: "var(--agenda-unavailable-border)",
    accentColor: "var(--agenda-unavailable-accent)",
    textColor: "var(--agenda-unavailable-text)",
  },
  unavailable: {
    backgroundColor: "var(--agenda-unavailable-bg)",
    borderColor: "var(--agenda-unavailable-border)",
    accentColor: "var(--agenda-unavailable-accent)",
    textColor: "var(--agenda-unavailable-text)",
  },
};

/** Static class names only — Tailwind must see these strings at build time. */
export const APPOINTMENT_STATUS_STYLES: Record<
  AppointmentVisualTone,
  { tone: AppointmentVisualTone; className: string }
> = {
  active: {
    tone: "active",
    className: "agenda-status-surface",
  },
  completed: {
    tone: "completed",
    className: "agenda-status-surface",
  },
  cancelled: {
    tone: "cancelled",
    className: "agenda-status-surface",
  },
  unavailable: {
    tone: "unavailable",
    className: "agenda-status-surface",
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
    borderLeftColor: string;
    color: string;
    borderWidth: number;
    borderLeftWidth: number;
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
  const surface = APPOINTMENT_SURFACE_CSS[presentation.visualState];
  return {
    tone: presentation.visualState,
    className: mapped.className,
    borderStyle: "solid",
    badge: presentation.badgeLabel,
    titleClassName: "",
    dotClassName: APPOINTMENT_VISUAL_DOT[presentation.visualState],
    statusLabel: presentation.statusLabel,
    style: {
      backgroundColor: surface.backgroundColor,
      borderColor: surface.borderColor,
      borderLeftColor: surface.accentColor,
      color: surface.textColor,
      borderWidth: 1,
      borderLeftWidth: 4,
      borderStyle: "solid",
    },
  };
}

export function offersClinicalAppointmentActions(
  appointment: {
    origin?: AppointmentOrigin;
    patient_id?: string | null;
    status?: AppointmentStatus;
    summary_snapshot?: string | null;
    summarySnapshot?: string | null;
    google_deleted_at?: string | null;
    googleDeletedAt?: string | null;
    google_color_id?: string | null;
    googleColorId?: string | null;
    google_event_type?: string | null;
    googleEventType?: string | null;
    unavailable_google_color_ids?: readonly string[] | null;
    unavailableGoogleColorIds?: readonly string[] | null;
    ends_at?: string;
    endsAt?: string;
  },
  now?: Date,
): boolean {
  const state = getAppointmentSemanticState(
    {
      status: appointment.status ?? "scheduled",
      origin: appointment.origin,
      summary_snapshot: appointment.summary_snapshot,
      summarySnapshot: appointment.summarySnapshot,
      google_deleted_at: appointment.google_deleted_at,
      googleDeletedAt: appointment.googleDeletedAt,
      google_color_id: appointment.google_color_id,
      googleColorId: appointment.googleColorId,
      google_event_type: appointment.google_event_type,
      googleEventType: appointment.googleEventType,
      unavailable_google_color_ids: appointment.unavailable_google_color_ids,
      unavailableGoogleColorIds: appointment.unavailableGoogleColorIds,
      ends_at: appointment.ends_at,
      endsAt: appointment.endsAt,
    },
    now,
  );
  return state === "active" || state === "completed";
}

import type {
  AppointmentOrigin,
  AppointmentStatus,
} from "@/features/calendar/contracts";

export type AppointmentVisualTone = "active" | "completed" | "cancelled";

/**
 * Full class names only — Tailwind must see these strings at build time.
 * Never interpolate `bg-${color}-100`.
 */
export const APPOINTMENT_STATUS_STYLES: Record<
  AppointmentStatus,
  { tone: AppointmentVisualTone; className: string }
> = {
  scheduled: {
    tone: "active",
    className: "bg-green-100 border-green-500 text-green-900",
  },
  confirmed: {
    tone: "active",
    className: "bg-green-100 border-green-500 text-green-900",
  },
  completed: {
    tone: "completed",
    className: "bg-blue-100 border-blue-500 text-blue-900",
  },
  cancelled: {
    tone: "cancelled",
    className: "bg-red-100 border-red-400 text-red-800 opacity-75",
  },
  no_show: {
    tone: "cancelled",
    className: "bg-red-100 border-red-400 text-red-800 opacity-75",
  },
};

export const APPOINTMENT_VISUAL_SURFACE: Record<AppointmentVisualTone, string> = {
  active: APPOINTMENT_STATUS_STYLES.scheduled.className,
  completed: APPOINTMENT_STATUS_STYLES.completed.className,
  cancelled: APPOINTMENT_STATUS_STYLES.cancelled.className,
};

export const APPOINTMENT_VISUAL_DOT: Record<AppointmentVisualTone, string> = {
  active: "bg-green-500",
  completed: "bg-blue-500",
  cancelled: "bg-red-400",
};

/**
 * Tailwind default palette hex. Applied as inline style so
 * `* { border-color }` in globals.css cannot hide the appointment color.
 */
export const APPOINTMENT_VISUAL_INLINE: Record<
  AppointmentVisualTone,
  {
    backgroundColor: string;
    borderColor: string;
    color: string;
    opacity?: number;
  }
> = {
  active: {
    backgroundColor: "#dcfce7",
    borderColor: "#22c55e",
    color: "#14532d",
  },
  completed: {
    backgroundColor: "#dbeafe",
    borderColor: "#3b82f6",
    color: "#1e3a8a",
  },
  cancelled: {
    backgroundColor: "#fee2e2",
    borderColor: "#f87171",
    color: "#991b1b",
    opacity: 0.75,
  },
};

export interface AppointmentVisualInput {
  status: AppointmentStatus;
  origin: AppointmentOrigin;
  patient_id: string | null;
}

export interface AppointmentVisualStatus {
  tone: AppointmentVisualTone;
  className: string;
  borderStyle: "solid" | "dashed";
  badge: "Google externo" | null;
  titleClassName: string;
  dotClassName: string;
  style: {
    backgroundColor: string;
    borderColor: string;
    color: string;
    opacity?: number;
    borderWidth: number;
    borderStyle: "solid" | "dashed";
  };
}

/**
 * Single Agenda/Meu Dia presentation helper.
 * Color comes only from administrative `status`. Origin never picks the fill.
 */
export function getAppointmentVisualStatus(
  appointment: AppointmentVisualInput,
): AppointmentVisualStatus {
  const mapped = APPOINTMENT_STATUS_STYLES[appointment.status];
  const palette = APPOINTMENT_VISUAL_INLINE[mapped.tone];
  const isGoogleExternal = appointment.origin === "GOOGLE_EXTERNAL";
  const borderStyle = isGoogleExternal ? "dashed" : "solid";

  return {
    tone: mapped.tone,
    className: mapped.className,
    borderStyle,
    badge: isGoogleExternal ? "Google externo" : null,
    titleClassName: mapped.tone === "cancelled" ? "line-through decoration-current" : "",
    dotClassName: APPOINTMENT_VISUAL_DOT[mapped.tone],
    style: {
      backgroundColor: palette.backgroundColor,
      borderColor: palette.borderColor,
      color: palette.color,
      ...(palette.opacity !== undefined ? { opacity: palette.opacity } : {}),
      borderWidth: 2,
      borderStyle,
    },
  };
}

export function offersClinicalAppointmentActions(appointment: {
  origin: AppointmentOrigin;
  patient_id: string | null;
}): boolean {
  return appointment.origin === "TESSELI" && appointment.patient_id != null;
}

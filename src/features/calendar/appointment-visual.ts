import type {
  AppointmentOrigin,
  AppointmentStatus,
} from "@/features/calendar/contracts";

export type AppointmentVisualTone = "active" | "completed" | "cancelled" | "neutral";

/**
 * Full class names only — Tailwind must see these strings at build time.
 * Never interpolate `bg-${color}-100`.
 */
export const APPOINTMENT_VISUAL_SURFACE: Record<AppointmentVisualTone, string> = {
  active: "bg-green-100 border-green-500 text-green-900",
  completed: "bg-blue-100 border-blue-500 text-blue-900",
  cancelled: "bg-red-100 border-red-400 text-red-800 opacity-75",
  neutral: "bg-zinc-100 border-zinc-400 text-zinc-900",
};

export const APPOINTMENT_VISUAL_DOT: Record<AppointmentVisualTone, string> = {
  active: "bg-green-500",
  completed: "bg-blue-500",
  cancelled: "bg-red-400",
  neutral: "bg-zinc-400",
};

/**
 * Tailwind default palette hex (green/blue/red/zinc). Applied as inline style so
 * `* { border-color }` in globals.css and production CSS layers cannot hide the
 * appointment color.
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
  neutral: {
    backgroundColor: "#f4f4f5",
    borderColor: "#a1a1aa",
    color: "#18181b",
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
  dotClassName: string;
  titleClassName: string;
  style: {
    backgroundColor: string;
    borderColor: string;
    color: string;
    opacity?: number;
    borderWidth: number;
    borderStyle: "solid" | "dashed";
  };
}

function isUnassociatedGoogleExternal(appointment: AppointmentVisualInput): boolean {
  return appointment.origin === "GOOGLE_EXTERNAL" && appointment.patient_id == null;
}

function toneForClinicalStatus(status: AppointmentStatus): Exclude<
  AppointmentVisualTone,
  "neutral"
> {
  switch (status) {
    case "completed":
      return "completed";
    case "cancelled":
    case "no_show":
      return "cancelled";
    case "scheduled":
    case "confirmed":
      return "active";
  }
}

/**
 * Single Agenda presentation helper. Clinical `status` wins.
 * Google colorId, sync_status, origin and modality do not pick the color.
 */
export function getAppointmentVisualStatus(
  appointment: AppointmentVisualInput,
): AppointmentVisualStatus {
  const tone = isUnassociatedGoogleExternal(appointment)
    ? "neutral"
    : toneForClinicalStatus(appointment.status);
  const palette = APPOINTMENT_VISUAL_INLINE[tone];

  return {
    tone,
    className: APPOINTMENT_VISUAL_SURFACE[tone],
    dotClassName: APPOINTMENT_VISUAL_DOT[tone],
    titleClassName: tone === "cancelled" ? "line-through decoration-current" : "",
    style: {
      backgroundColor: palette.backgroundColor,
      borderColor: palette.borderColor,
      color: palette.color,
      ...(palette.opacity !== undefined ? { opacity: palette.opacity } : {}),
      borderWidth: 2,
      borderStyle: tone === "neutral" ? "dashed" : "solid",
    },
  };
}

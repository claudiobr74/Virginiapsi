import type {
  AppointmentOrigin,
  AppointmentStatus,
} from "@/features/calendar/contracts";

export type AppointmentVisualTone = "active" | "completed" | "cancelled" | "neutral";

/**
 * Static Tailwind class maps — full class names so the production build
 * keeps them. Never interpolate `bg-${color}-100`.
 */
export const APPOINTMENT_VISUAL_SURFACE: Record<AppointmentVisualTone, string> = {
  active: "bg-green-100 border-green-500 text-green-900",
  completed: "bg-blue-100 border-blue-500 text-blue-900",
  cancelled: "bg-red-100 border-red-400 text-red-800 opacity-75",
  neutral: "bg-stone-100 border-stone-300 text-stone-800",
};

export const APPOINTMENT_VISUAL_DOT: Record<AppointmentVisualTone, string> = {
  active: "bg-green-500",
  completed: "bg-blue-500",
  cancelled: "bg-red-400",
  neutral: "bg-stone-400",
};

export interface AppointmentVisualInput {
  status: AppointmentStatus;
  origin: AppointmentOrigin;
  patient_id: string | null;
  managed_by_tesseli?: boolean;
}

export interface AppointmentVisualStatus {
  tone: AppointmentVisualTone;
  className: string;
  dotClassName: string;
  titleClassName: string;
}

function isUnassociatedGoogleExternal(appointment: AppointmentVisualInput): boolean {
  return (
    appointment.origin === "GOOGLE_EXTERNAL" &&
    appointment.patient_id == null &&
    appointment.managed_by_tesseli !== true
  );
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
 * Single presentation helper for Agenda appointment colors.
 * Clinical `status` wins. Google colorId / sync_status / origin do not.
 */
export function getAppointmentVisualStatus(
  appointment: AppointmentVisualInput,
): AppointmentVisualStatus {
  const tone = isUnassociatedGoogleExternal(appointment)
    ? "neutral"
    : toneForClinicalStatus(appointment.status);

  return {
    tone,
    className: APPOINTMENT_VISUAL_SURFACE[tone],
    dotClassName: APPOINTMENT_VISUAL_DOT[tone],
    titleClassName: tone === "cancelled" ? "line-through decoration-current" : "",
  };
}

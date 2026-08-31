import { ExternalLink, Globe2, MapPin, Video } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  APPOINTMENT_STATUS_BADGE,
  APPOINTMENT_STATUS_LABELS,
  type AppointmentRow,
} from "@/features/calendar/contracts";
import { MODALITY_LABELS } from "@/features/patients/contracts";
import { StartSessionButton } from "@/features/sessions/components/start-session-button";
import { formatInTimeZone } from "@/lib/utils/timezone";
import { cn } from "@/lib/utils/cn";

const MODALITY_ICON = { in_person: MapPin, online: Video, hybrid: Globe2 } as const;

function modalityLine(appointment: AppointmentRow): string {
  const label = MODALITY_LABELS[appointment.modality];
  if (
    appointment.modality === "online" &&
    appointment.meet_status === "success" &&
    appointment.meet_url
  ) {
    return `${label} · Google Meet`;
  }
  return label;
}

export function AppointmentCard({
  appointment,
  timeZone,
  isAdmin = false,
  compact = false,
  onClick,
}: {
  appointment: AppointmentRow;
  timeZone: string;
  isAdmin?: boolean;
  compact?: boolean;
  onClick?: () => void;
}) {
  const isExternal = appointment.origin === "GOOGLE_EXTERNAL";
  const ModalityIcon = MODALITY_ICON[appointment.modality];
  const timeRange = `${formatInTimeZone(appointment.starts_at, timeZone)} – ${formatInTimeZone(appointment.ends_at, timeZone)}`;
  const canStart =
    isAdmin &&
    !isExternal &&
    Boolean(appointment.patient_id) &&
    appointment.status !== "cancelled";
  const showActions =
    !compact && (canStart || (appointment.meet_url && appointment.meet_status === "success"));

  return (
    <article
      className={cn(
        "flex w-full flex-col rounded-2xl border",
        compact ? "gap-1.5 px-2.5 py-2" : "gap-3 px-4 py-4",
        isExternal
          ? "border-dashed border-border bg-surface/40"
          : "border-border bg-card shadow-sm",
      )}
    >
      <button
        type="button"
        onClick={onClick}
        className="flex w-full flex-col gap-2 text-left transition-colors hover:opacity-90"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p
              className={cn(
                "truncate font-serif italic font-semibold text-foreground",
                compact ? "text-sm" : "text-base",
              )}
            >
              {appointment.summary_snapshot ?? "Sem paciente vinculado"}
            </p>
            <p className="mt-0.5 font-mono text-xs text-muted-foreground sm:text-sm">{timeRange}</p>
          </div>
          {isExternal ? (
            <StatusBadge status="info" label="Evento Google" />
          ) : (
            <StatusBadge
              status={APPOINTMENT_STATUS_BADGE[appointment.status]}
              label={APPOINTMENT_STATUS_LABELS[appointment.status]}
            />
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-sm text-foreground">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-surface px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
            <ModalityIcon className="size-3.5 shrink-0" aria-hidden />
            {isExternal ? "Google Calendar" : modalityLine(appointment)}
          </span>
          {appointment.meet_url && appointment.meet_status === "success" && !compact ? (
            <span className="truncate text-xs text-muted-foreground">{appointment.meet_url}</span>
          ) : null}
          {appointment.meet_status === "pending" ? (
            <span className="text-xs font-semibold text-pending">Meet em criação…</span>
          ) : null}
        </div>
      </button>

      {showActions ? (
        <div className="flex flex-wrap items-center gap-2">
          {canStart && appointment.patient_id ? (
            <StartSessionButton
              patientId={appointment.patient_id}
              appointmentId={appointment.id}
              label="Atender"
            />
          ) : null}
          {appointment.meet_url && appointment.meet_status === "success" ? (
            <a
              href={appointment.meet_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 items-center gap-1.5 rounded-2xl border border-border bg-surface px-3.5 text-sm font-semibold text-deep-neutral hover:bg-sage-light/30"
            >
              Link Meet
              <ExternalLink className="size-3.5" aria-hidden />
            </a>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

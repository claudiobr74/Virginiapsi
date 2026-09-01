import { ExternalLink, Globe2, MapPin, Video } from "lucide-react";
import {
  getAppointmentVisualStatus,
  offersClinicalAppointmentActions,
} from "@/features/calendar/appointment-visual";
import { appointmentRowToAttendTarget } from "@/features/calendar/attend-target";
import { AttendAppointmentButton } from "@/features/calendar/components/attend-appointment-button";
import { GoogleOriginMark } from "@/features/calendar/components/google-origin-mark";
import type { AppointmentRow } from "@/features/calendar/contracts";
import { MODALITY_LABELS } from "@/features/patients/contracts";
import { formatInTimeZone } from "@/lib/utils/timezone";
import { cn } from "@/lib/utils/cn";

const MODALITY_ICON = { in_person: MapPin, online: Video, hybrid: Globe2 } as const;

export function AppointmentCard({
  appointment,
  timeZone,
  isAdmin = false,
  compact = false,
  now,
  onClick,
}: {
  appointment: AppointmentRow;
  timeZone: string;
  isAdmin?: boolean;
  compact?: boolean;
  now?: Date;
  onClick?: () => void;
}) {
  const visual = getAppointmentVisualStatus(appointment, now);
  const ModalityIcon = MODALITY_ICON[appointment.modality];
  const timeRange = `${formatInTimeZone(appointment.starts_at, timeZone)} – ${formatInTimeZone(appointment.ends_at, timeZone)}`;
  const canStart =
    isAdmin && offersClinicalAppointmentActions(appointment, now);
  const showActions =
    !compact && (canStart || (appointment.meet_url && appointment.meet_status === "success"));

  return (
    <article
      data-appointment-visual={visual.tone}
      data-appointment-origin={appointment.origin}
      style={visual.style}
      className={cn(
        "flex w-full min-w-0 flex-col rounded-lg",
        compact ? "gap-0.5 px-2 py-1.5" : "gap-2 px-3 py-2.5",
        visual.className,
      )}
    >
      <button
        type="button"
        onClick={onClick}
        className="flex w-full min-w-0 flex-col gap-1 text-left text-white"
      >
        <div className="flex items-start justify-between gap-2">
          <p
            className={cn(
              "min-w-0 flex-1 font-semibold leading-snug break-words",
              compact ? "text-xs" : "text-sm sm:text-base",
            )}
          >
            {appointment.summary_snapshot ?? "Sem paciente vinculado"}
          </p>
          <div className="flex shrink-0 flex-col items-end gap-1">
            {visual.badge ? <GoogleOriginMark compact={compact} /> : null}
            {compact ? null : (
              <span className="text-[10px] font-semibold uppercase tracking-wide text-white/85">
                {visual.statusLabel}
              </span>
            )}
          </div>
        </div>
        <p className={cn("font-mono tabular-nums text-white/90", compact ? "text-[10px]" : "text-xs sm:text-sm")}>
          {timeRange}
        </p>
        {compact ? null : (
          <p className="flex min-w-0 items-center gap-1.5 text-[11px] text-white/80">
            <ModalityIcon className="size-3 shrink-0" aria-hidden />
            <span className="truncate">{MODALITY_LABELS[appointment.modality]}</span>
          </p>
        )}
        {appointment.sync_status === "error" ? (
          <p className="text-[11px] font-semibold text-white">Não foi possível sincronizar com Google.</p>
        ) : null}
      </button>

      {showActions ? (
        <div className="flex flex-wrap items-center gap-2">
          {canStart ? (
            <AttendAppointmentButton
              appointment={appointmentRowToAttendTarget(appointment)}
              timeZone={timeZone}
              canStartSession={isAdmin}
              now={now}
              returnTo="/app/agenda"
            />
          ) : null}
          {appointment.meet_url && appointment.meet_status === "success" ? (
            <a
              href={appointment.meet_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/25 bg-white/15 px-3 text-xs font-semibold text-white hover:bg-white/25"
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

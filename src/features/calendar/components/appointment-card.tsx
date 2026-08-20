import { Globe2, MapPin, Video } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  APPOINTMENT_STATUS_BADGE,
  APPOINTMENT_STATUS_LABELS,
  type AppointmentRow,
} from "@/features/calendar/contracts";
import { formatInTimeZone } from "@/lib/utils/timezone";
import { cn } from "@/lib/utils/cn";

const MODALITY_ICON = { in_person: MapPin, online: Video, hybrid: Globe2 } as const;

export function AppointmentCard({
  appointment,
  timeZone,
  onClick,
}: {
  appointment: AppointmentRow;
  timeZone: string;
  onClick?: () => void;
}) {
  const isExternal = appointment.origin === "GOOGLE_EXTERNAL";
  const ModalityIcon = MODALITY_ICON[appointment.modality];

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full flex-col gap-1.5 rounded-2xl border px-3.5 py-3 text-left transition-colors",
        isExternal
          ? "border-dashed border-border bg-surface/40 hover:bg-surface/70"
          : "border-border bg-card hover:border-sage-light hover:bg-surface/60",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs font-semibold text-foreground sm:text-sm">
          {formatInTimeZone(appointment.starts_at, timeZone)} –{" "}
          {formatInTimeZone(appointment.ends_at, timeZone)}
        </span>
        {isExternal ? (
          <StatusBadge status="info" label="Evento externo do Google" />
        ) : (
          <StatusBadge
            status={APPOINTMENT_STATUS_BADGE[appointment.status]}
            label={APPOINTMENT_STATUS_LABELS[appointment.status]}
          />
        )}
      </div>
      <div className="flex items-center gap-1.5 text-sm text-foreground">
        <ModalityIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <span className="truncate">
          {appointment.summary_snapshot ?? "Sem paciente vinculado"}
        </span>
      </div>
      {appointment.meet_url && appointment.meet_status === "success" ? (
        <span className="text-xs font-semibold text-sage-700">Meet criado</span>
      ) : null}
      {appointment.meet_status === "pending" ? (
        <span className="text-xs font-semibold text-pending">Meet em criação…</span>
      ) : null}
    </button>
  );
}

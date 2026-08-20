import { CalendarClock, Globe2, MapPin, Video } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  APPOINTMENT_STATUS_BADGE,
  APPOINTMENT_STATUS_LABELS,
} from "@/features/calendar/contracts";
import { SessionActions } from "@/features/dashboard/components/session-actions";
import {
  patientDisplayLabel,
  type MyDayAppointment,
} from "@/features/dashboard/contracts";
import { MODALITY_LABELS } from "@/features/patients/contracts";
import { formatInTimeZone } from "@/lib/utils/timezone";

const MODALITY_ICON = { in_person: MapPin, online: Video, hybrid: Globe2 } as const;

export function NextSessionCard({
  appointment,
  timeZone,
}: {
  appointment: MyDayAppointment | null;
  timeZone: string;
}) {
  if (!appointment) {
    return (
      <EmptyState
        icon={CalendarClock}
        title="Nenhuma sessão restante hoje"
        description="O restante do dia está livre. A linha do tempo abaixo mostra o que já aconteceu, se houver."
      />
    );
  }

  const ModalityIcon = MODALITY_ICON[appointment.modality];

  return (
    <section
      aria-labelledby="next-session-heading"
      className="flex flex-col gap-4 rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-6"
    >
      <div className="flex flex-col gap-1">
        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
          Próxima sessão
        </p>
        <h2
          id="next-session-heading"
          className="font-serif text-lg italic font-semibold text-foreground sm:text-xl"
        >
          {patientDisplayLabel(appointment)}
        </h2>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="font-mono text-2xl font-semibold tabular-nums text-foreground sm:text-3xl">
            {formatInTimeZone(appointment.startsAt, timeZone)}
            <span className="text-base font-medium text-muted-foreground">
              {" "}
              – {formatInTimeZone(appointment.endsAt, timeZone)}
            </span>
          </span>
          <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <ModalityIcon className="size-3.5" aria-hidden />
            {MODALITY_LABELS[appointment.modality]}
          </span>
        </div>
        <StatusBadge
          status={APPOINTMENT_STATUS_BADGE[appointment.status]}
          label={APPOINTMENT_STATUS_LABELS[appointment.status]}
        />
      </div>

      <SessionActions appointment={appointment} timeZone={timeZone} />
    </section>
  );
}

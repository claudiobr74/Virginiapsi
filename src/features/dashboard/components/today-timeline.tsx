import { CalendarDays, Globe2, MapPin, Video } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeader } from "@/components/ui/section-header";
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
import { cn } from "@/lib/utils/cn";

const MODALITY_ICON = { in_person: MapPin, online: Video, hybrid: Globe2 } as const;

export function TodayTimeline({
  appointments,
  timeZone,
  highlightedId,
}: {
  appointments: MyDayAppointment[];
  timeZone: string;
  highlightedId?: string | null;
}) {
  return (
    <section aria-labelledby="timeline-heading" className="flex flex-col gap-3">
      <SectionHeader
        id="timeline-heading"
        title="Linha do tempo de hoje"
        description="Consultas gerenciadas pelo Tesseli neste dia"
      />
      {appointments.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="Nenhuma consulta hoje"
          description="O dia está resolvido — ou ainda livre. Abra a Agenda para marcar a próxima sessão."
        />
      ) : (
        <ol className="flex flex-col gap-2">
          {appointments.map((appointment) => {
            const ModalityIcon = MODALITY_ICON[appointment.modality];
            const isNext = appointment.id === highlightedId;
            return (
              <li
                key={appointment.id}
                className={cn(
                  "flex flex-col gap-3 rounded-2xl border bg-card px-4 py-3.5",
                  isNext ? "border-primary/50" : "border-border",
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex flex-col gap-0.5">
                    <span className="font-mono text-sm font-semibold tabular-nums text-foreground">
                      {formatInTimeZone(appointment.startsAt, timeZone)} –{" "}
                      {formatInTimeZone(appointment.endsAt, timeZone)}
                    </span>
                    <span className="text-sm font-medium text-foreground">
                      {patientDisplayLabel(appointment)}
                    </span>
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
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
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

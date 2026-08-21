import { StatusBadge } from "@/components/ui/status-badge";
import {
  APPOINTMENT_STATUS_BADGE,
  APPOINTMENT_STATUS_LABELS,
} from "@/features/calendar/contracts";
import { DashboardWidget } from "@/features/dashboard/components/dashboard-widget";
import { SessionActions } from "@/features/dashboard/components/session-actions";
import {
  patientDisplayLabel,
  type MyDayAppointment,
} from "@/features/dashboard/contracts";
import { sessionCountLabel } from "@/features/dashboard/stats";
import { MODALITY_LABELS } from "@/features/patients/contracts";
import { formatInTimeZone } from "@/lib/utils/timezone";
import { cn } from "@/lib/utils/cn";

export function TodayTimeline({
  appointments,
  timeZone,
  highlightedId,
  canStartSession,
}: {
  appointments: MyDayAppointment[];
  timeZone: string;
  highlightedId?: string | null;
  canStartSession: boolean;
}) {
  return (
    <DashboardWidget
      id="timeline-heading"
      title="Linha do Tempo de Hoje"
      description={
        appointments.length === 0
          ? undefined
          : `${sessionCountLabel(appointments.length)} agendadas`
      }
      empty={appointments.length === 0}
      emptyLabel="O dia está resolvido — ou ainda livre. Abra a Agenda para marcar a próxima sessão."
    >
      <ol className="flex flex-col">
        {appointments.map((appointment) => {
          const isNext = appointment.id === highlightedId;
          return (
            <li
              key={appointment.id}
              className={cn(
                "flex flex-col gap-3 border-b border-border py-4 last:border-b-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between",
                isNext && "rounded-2xl border-b-0 bg-surface/60 px-3 sm:px-4",
              )}
            >
              <div className="flex min-w-0 items-start gap-3">
                <span className="w-14 shrink-0 rounded-xl bg-surface px-2 py-1.5 text-center font-mono text-sm font-semibold tabular-nums text-foreground">
                  {formatInTimeZone(appointment.startsAt, timeZone)}
                </span>
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-sm font-semibold text-foreground">
                    {patientDisplayLabel(appointment)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {MODALITY_LABELS[appointment.modality]}
                    {appointment.patientPublicCode
                      ? ` · ${appointment.patientPublicCode}`
                      : null}
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2 sm:shrink-0">
                <StatusBadge
                  status={APPOINTMENT_STATUS_BADGE[appointment.status]}
                  label={APPOINTMENT_STATUS_LABELS[appointment.status]}
                />
                <SessionActions
                  appointment={appointment}
                  timeZone={timeZone}
                  canStartSession={canStartSession}
                  layout="timeline"
                />
              </div>
            </li>
          );
        })}
      </ol>
    </DashboardWidget>
  );
}

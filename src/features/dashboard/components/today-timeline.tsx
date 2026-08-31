import { Globe, Home } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { getAppointmentVisualStatus } from "@/features/calendar/appointment-visual";
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
import { attendanceCountLabel } from "@/features/dashboard/stats";
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
      title="Agenda de Hoje"
      description={
        appointments.length === 0 ? undefined : attendanceCountLabel(appointments.length)
      }
      empty={appointments.length === 0}
      emptyLabel="O dia está resolvido — ou ainda livre. Abra a Agenda para marcar a próxima sessão."
    >
      <ol className="flex flex-col">
        {appointments.map((appointment) => {
          const isNext = appointment.id === highlightedId;
          const ModalityIcon = appointment.modality === "online" ? Globe : Home;
          const visual = getAppointmentVisualStatus({
            status: appointment.status,
            origin: appointment.origin,
            patient_id: appointment.patientId,
          });
          return (
            <li
              key={appointment.id}
              data-appointment-visual={visual.tone}
              style={visual.style}
              className={cn(
                "my-1 flex flex-col gap-2 rounded-xl border-2 px-3 py-3",
                visual.className,
                visual.titleClassName,
                isNext && "ring-2 ring-sage-700",
              )}
            >
              <div className="flex min-w-0 items-center gap-3">
                <div className="w-14 shrink-0">
                  <p className="font-mono text-sm font-semibold tabular-nums">
                    {formatInTimeZone(appointment.startsAt, timeZone)}
                  </p>
                  <p className="font-mono text-[11px] tabular-nums opacity-80">
                    {formatInTimeZone(appointment.endsAt, timeZone)}
                  </p>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    {patientDisplayLabel(appointment)}
                  </p>
                  <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px] opacity-80">
                    {appointment.patientPublicCode ? (
                      <span className="font-mono">{appointment.patientPublicCode}</span>
                    ) : null}
                    {appointment.patientPublicCode ? (
                      <span className="size-1 shrink-0 rounded-full bg-current" aria-hidden />
                    ) : null}
                    <ModalityIcon className="size-3 shrink-0" aria-hidden />
                    <span className="truncate">{MODALITY_LABELS[appointment.modality]}</span>
                  </p>
                </div>
                <StatusBadge
                  status={APPOINTMENT_STATUS_BADGE[appointment.status]}
                  label={APPOINTMENT_STATUS_LABELS[appointment.status]}
                />
              </div>
              <SessionActions
                appointment={appointment}
                timeZone={timeZone}
                canStartSession={canStartSession}
                layout="timeline"
              />
            </li>
          );
        })}
      </ol>
    </DashboardWidget>
  );
}

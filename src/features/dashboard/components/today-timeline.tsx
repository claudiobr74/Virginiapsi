import { CalendarDays, Globe, Home } from "lucide-react";
import {
  getAppointmentVisualStatus,
  myDayAppointmentToPresentationInput,
} from "@/features/calendar/appointment-visual";
import { GoogleOriginMark } from "@/features/calendar/components/google-origin-mark";
import { countValidAgendaSessions } from "@/features/calendar/google-event-status";
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
  now,
}: {
  appointments: MyDayAppointment[];
  timeZone: string;
  highlightedId?: string | null;
  canStartSession: boolean;
  now?: Date;
}) {
  const validCount = countValidAgendaSessions(
    appointments.map((appointment) => ({
      status: appointment.status,
      origin: appointment.origin,
      summarySnapshot: appointment.summarySnapshot,
      googleColorId: appointment.googleColorId,
      googleEventType: appointment.googleEventType,
      googleDeletedAt: appointment.googleDeletedAt,
      cancelledGoogleColorIds: appointment.cancelledGoogleColorIds,
      unavailableGoogleColorIds: appointment.unavailableGoogleColorIds,
      endsAt: appointment.endsAt,
    })),
  );

  return (
    <DashboardWidget
      id="timeline-heading"
      title="Agenda de Hoje"
      tone="neutral"
      icon={<CalendarDays />}
      description={appointments.length === 0 ? undefined : attendanceCountLabel(validCount)}
      empty={appointments.length === 0}
      emptyLabel="O dia está resolvido — ou ainda livre. Abra a Agenda para marcar a próxima sessão."
    >
      <ol className="flex flex-col">
        {appointments.map((appointment) => {
          const isNext = appointment.id === highlightedId;
          const ModalityIcon = appointment.modality === "online" ? Globe : Home;
          const visual = getAppointmentVisualStatus(
            myDayAppointmentToPresentationInput(appointment),
            now,
          );
          return (
            <li
              key={appointment.id}
              data-appointment-visual={visual.tone}
              data-appointment-origin={appointment.origin}
              style={visual.style}
              className={cn(
                "my-1 flex flex-col gap-2 rounded-lg px-3 py-3",
                visual.className,
                isNext && "agenda-event-selected",
              )}
            >
              <div className="flex min-w-0 items-center gap-3">
                <div className="w-14 shrink-0">
                  <p className="font-mono text-sm font-semibold tabular-nums">
                    {formatInTimeZone(appointment.startsAt, timeZone)}
                  </p>
                  <p className="font-mono text-[11px] tabular-nums text-muted-foreground">
                    {formatInTimeZone(appointment.endsAt, timeZone)}
                  </p>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="break-words text-sm font-semibold text-foreground">
                    {patientDisplayLabel(appointment)}
                  </p>
                  <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
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
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {visual.badge ? <GoogleOriginMark compact /> : null}
                  <span className="text-[10px] font-semibold uppercase tracking-wide">
                    {visual.statusLabel}
                  </span>
                </div>
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

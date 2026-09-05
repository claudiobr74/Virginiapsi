import { CalendarClock, Globe, Sparkles } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  getAppointmentVisualStatus,
  myDayAppointmentToPresentationInput,
} from "@/features/calendar/appointment-visual";
import { GoogleOriginMark } from "@/features/calendar/components/google-origin-mark";
import type { MeetRequestAction } from "@/features/calendar/components/meet-action-button";
import { SessionActions } from "@/features/dashboard/components/session-actions";
import type { MyDayAppointment } from "@/features/dashboard/contracts";
import { heroPatientName, meetHostLabel, startsInLabel } from "@/features/dashboard/stats";
import { MODALITY_LABELS } from "@/features/patients/contracts";
import { formatInTimeZone } from "@/lib/utils/timezone";
import { cn } from "@/lib/utils/cn";

export function NextSessionCard({
  appointment,
  timeZone,
  canStartSession,
  requestMeetAction,
  emptyDay,
  now,
}: {
  appointment: MyDayAppointment | null;
  timeZone: string;
  canStartSession: boolean;
  requestMeetAction?: MeetRequestAction;
  emptyDay: boolean;
  now?: Date;
}) {
  if (emptyDay) {
    return (
      <section className="flex flex-col gap-4 rounded-[20px] border border-border bg-card p-6 shadow-card">
        <p className="text-xs font-bold uppercase tracking-wide text-sage-700">Dia livre</p>
        <h2 className="font-serif text-2xl font-semibold text-foreground">
          Não há atendimentos agendados para hoje
        </h2>
        <p className="max-w-xl text-sm leading-6 text-muted-foreground">
          Aproveite para revisar prontuários pendentes, adiantar leituras ou planejar os
          próximos dias.
        </p>
        <div>
          <Button asChild variant="secondary">
            <Link href="/app/agenda?view=week">Ver Agenda da Semana</Link>
          </Button>
        </div>
      </section>
    );
  }

  if (!appointment) {
    return (
      <section className="flex flex-col gap-2 rounded-[20px] border border-border bg-card p-6 shadow-card">
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
          <CalendarClock className="size-3.5" aria-hidden />
          Próxima sessão
        </p>
        <h2 className="font-serif text-xl font-semibold text-foreground">
          Nenhuma sessão restante hoje
        </h2>
        <p className="text-sm text-muted-foreground">
          O restante do dia está livre. A agenda ao lado mostra o que já aconteceu, se
          houver.
        </p>
      </section>
    );
  }

  const starts = formatInTimeZone(appointment.startsAt, timeZone);
  const modalityLabel = MODALITY_LABELS[appointment.modality];
  const isOnline = appointment.modality === "online";
  const untilLabel = startsInLabel(appointment.startsAt);
  const meetHost = meetHostLabel(appointment.meetUrl);
  const visual = getAppointmentVisualStatus(
    myDayAppointmentToPresentationInput(appointment),
    now,
  );

  return (
    <section
      aria-labelledby="next-session-heading"
      data-appointment-visual={visual.tone}
      data-appointment-origin={appointment.origin}
      style={visual.style}
      className={cn("flex flex-col gap-5 rounded-[20px] p-6", visual.className)}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <p className="agenda-status-kicker">Próxima sessão</p>
          {untilLabel ? <span className="text-[13px] text-muted-foreground">{untilLabel}</span> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {visual.badge ? <GoogleOriginMark /> : null}
          {isOnline ? (
            <span className="rounded-md bg-foreground/10 px-2 py-1 text-[11px] font-semibold uppercase text-foreground">
              Online
            </span>
          ) : (
            <span className="rounded-md bg-foreground/10 px-2 py-1 text-[11px] font-semibold uppercase text-foreground">
              {modalityLabel}
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <h2 id="next-session-heading" className="font-serif text-[28px] font-bold leading-tight text-foreground">
          {heroPatientName(appointment)}
        </h2>
        <p className="text-sm text-muted-foreground">
          {appointment.patientPublicCode
            ? `Código de Registro: ${appointment.patientPublicCode} • ${starts}`
            : starts}
        </p>
      </div>

      {appointment.meetUrl && appointment.meetStatus === "success" && meetHost ? (
        <p className="flex items-center gap-2 rounded-lg border border-border bg-card/80 px-3 py-2.5 font-mono text-xs text-foreground">
          <Globe className="size-4 shrink-0" aria-hidden />
          <span className="min-w-0 truncate">Google Meet: {meetHost}</span>
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {appointment.patientId ? (
          <Button asChild variant="secondary" size="sm">
            <Link href={`/app/patients/${appointment.patientId}?tab=record`}>
              <Sparkles className="size-3.5" aria-hidden />
              Preparar sessão
            </Link>
          </Button>
        ) : null}
        <SessionActions
          appointment={appointment}
          timeZone={timeZone}
          canStartSession={canStartSession}
          requestMeetAction={requestMeetAction}
          layout="full"
        />
      </div>
    </section>
  );
}

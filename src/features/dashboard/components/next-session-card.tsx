import { CalendarClock } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SessionActions } from "@/features/dashboard/components/session-actions";
import {
  patientDisplayLabel,
  type MyDayAppointment,
} from "@/features/dashboard/contracts";
import { heroPatientName } from "@/features/dashboard/stats";
import { MODALITY_LABELS } from "@/features/patients/contracts";
import { formatInTimeZone } from "@/lib/utils/timezone";

export function NextSessionCard({
  appointment,
  timeZone,
  canStartSession,
  emptyDay,
}: {
  appointment: MyDayAppointment | null;
  timeZone: string;
  canStartSession: boolean;
  emptyDay: boolean;
}) {
  if (emptyDay) {
    return (
      <section className="flex flex-col gap-4 rounded-3xl border border-border bg-card p-6 shadow-sm sm:p-8">
        <p className="text-xs font-bold uppercase tracking-wide text-sage-700">Dia livre</p>
        <h2 className="font-serif text-2xl italic font-semibold text-foreground">
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
      <section className="flex flex-col gap-2 rounded-3xl border border-border bg-card p-6 shadow-sm">
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
          <CalendarClock className="size-3.5" aria-hidden />
          Próxima sessão
        </p>
        <h2 className="font-serif text-xl italic font-semibold text-foreground">
          Nenhuma sessão restante hoje
        </h2>
        <p className="text-sm text-muted-foreground">
          O restante do dia está livre. A linha do tempo abaixo mostra o que já aconteceu,
          se houver.
        </p>
      </section>
    );
  }

  const starts = formatInTimeZone(appointment.startsAt, timeZone);
  const ends = formatInTimeZone(appointment.endsAt, timeZone);
  const modalityLabel = MODALITY_LABELS[appointment.modality];
  const meetHint =
    appointment.modality === "online" && appointment.meetStatus === "success"
      ? "Online · Google Meet"
      : modalityLabel;

  return (
    <section
      aria-labelledby="next-session-heading"
      className="flex flex-col gap-6 rounded-3xl bg-primary p-6 text-primary-foreground shadow-[0_12px_16px_rgba(107,112,92,0.17)] sm:p-7"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="rounded-full bg-[#4f5341] px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-white">
          Próximo atendimento
        </span>
        <span className="flex items-center gap-2 font-mono text-[13px] font-bold">
          <span className="size-2 rounded-full bg-success" aria-hidden />
          {starts} — {ends}
        </span>
      </div>

      <div className="flex flex-col gap-2">
        <h2 id="next-session-heading" className="text-[28px] font-bold leading-tight">
          {heroPatientName(appointment)}
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded-md bg-white/15 px-2.5 py-1 text-xs font-semibold">
            {meetHint}
          </span>
          {appointment.patientPublicCode ? (
            <span className="font-mono text-[13px] text-white/80">
              {patientDisplayLabel(appointment)}
            </span>
          ) : null}
        </div>
      </div>

      <SessionActions
        appointment={appointment}
        timeZone={timeZone}
        canStartSession={canStartSession}
        tone="onPrimary"
        layout="hero"
      />
    </section>
  );
}

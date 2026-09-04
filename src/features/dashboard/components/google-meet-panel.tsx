"use client";

import { Video } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  MeetActionButton,
  type MeetRequestAction,
} from "@/features/calendar/components/meet-action-button";
import { DashboardWidget } from "@/features/dashboard/components/dashboard-widget";
import {
  patientDisplayLabel,
  type MyDayAppointment,
} from "@/features/dashboard/contracts";
import { formatInTimeZone } from "@/lib/utils/timezone";

export type StandaloneMeetRequestAction = () => Promise<{
  error?: string;
  meetUrl?: string;
}>;

function isRelevantMeetAppointment(appointment: MyDayAppointment, now: Date) {
  if (appointment.modality !== "online") {
    return false;
  }
  if (["cancelled", "completed", "no_show"].includes(appointment.status)) {
    return false;
  }
  if (new Date(appointment.endsAt).getTime() <= now.getTime()) {
    return false;
  }

  return (
    appointment.origin === "TESSELI" ||
    (appointment.meetStatus === "success" && Boolean(appointment.meetUrl))
  );
}

export function GoogleMeetPanel({
  appointments,
  timeZone,
  now,
  requestMeetAction,
  requestStandaloneMeetAction,
}: {
  appointments: MyDayAppointment[];
  timeZone: string;
  now: Date;
  requestMeetAction?: MeetRequestAction;
  requestStandaloneMeetAction?: StandaloneMeetRequestAction;
}) {
  const rooms = appointments.filter((appointment) =>
    isRelevantMeetAppointment(appointment, now),
  );
  const [isCreatingStandalone, startStandaloneTransition] = useTransition();
  const [standaloneMeetUrl, setStandaloneMeetUrl] = useState<string | null>(null);
  const [standaloneError, setStandaloneError] = useState<string | null>(null);

  function createStandaloneRoom() {
    if (!requestStandaloneMeetAction) {
      return;
    }

    setStandaloneError(null);
    startStandaloneTransition(async () => {
      const result = await requestStandaloneMeetAction();
      if (result.error) {
        setStandaloneError(result.error);
        return;
      }
      if (result.meetUrl) {
        setStandaloneMeetUrl(result.meetUrl);
      }
    });
  }

  return (
    <DashboardWidget
      id="google-meet-today"
      title="Salas Google Meet"
      description="Crie uma sala avulsa ou abra as salas dos atendimentos online"
      icon={<Video className="size-4" aria-hidden />}
    >
      <div className="rounded-lg border border-border bg-muted/20 p-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">Sala avulsa</p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              Crie um Google Meet agora, sem depender de paciente ou agendamento.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {standaloneMeetUrl ? (
              <Button asChild size="sm" variant="secondary">
                <a
                  href={standaloneMeetUrl}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Abrir sala Google Meet criada em uma nova aba"
                >
                  <Video className="size-3.5" aria-hidden />
                  Abrir sala criada
                </a>
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant={standaloneMeetUrl ? "ghost" : "secondary"}
              isLoading={isCreatingStandalone}
              onClick={createStandaloneRoom}
              disabled={!requestStandaloneMeetAction}
              aria-label={standaloneMeetUrl ? "Criar outra sala Google Meet" : "Criar sala Google Meet"}
            >
              <Video className="size-3.5" aria-hidden />
              {isCreatingStandalone
                ? "Criando sala…"
                : standaloneMeetUrl
                  ? "Criar outra"
                  : "Criar sala Google Meet"}
            </Button>
          </div>
        </div>
        {standaloneError ? (
          <p role="alert" className="mt-2 text-xs text-failed">
            {standaloneError}
          </p>
        ) : null}
      </div>

      {rooms.length === 0 ? (
        <div className="mt-3 rounded-lg border border-dashed border-border bg-muted/20 px-4 py-4 text-center">
          <p className="text-xs leading-relaxed text-muted-foreground">
            Nenhum atendimento online pendente agora. A criação de sala avulsa continua disponível acima.
          </p>
        </div>
      ) : (
        <div className="mt-3 flex flex-col divide-y divide-border">
          {rooms.map((appointment) => (
            <div
              key={appointment.id}
              className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="text-xs font-semibold text-sage-700">
                  {formatInTimeZone(appointment.startsAt, timeZone, {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
                <p className="mt-0.5 truncate text-sm font-semibold text-foreground">
                  {patientDisplayLabel(appointment)}
                </p>
              </div>
              <MeetActionButton
                appointmentId={appointment.id}
                modality={appointment.modality}
                origin={appointment.origin}
                meetUrl={appointment.meetUrl}
                meetStatus={appointment.meetStatus}
                requestMeetAction={requestMeetAction}
                size="sm"
                variant="secondary"
                className="shrink-0"
              />
            </div>
          ))}
        </div>
      )}
    </DashboardWidget>
  );
}

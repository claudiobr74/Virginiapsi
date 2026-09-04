"use client";

import { Video } from "lucide-react";
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
}: {
  appointments: MyDayAppointment[];
  timeZone: string;
  now: Date;
  requestMeetAction?: MeetRequestAction;
}) {
  const rooms = appointments.filter((appointment) =>
    isRelevantMeetAppointment(appointment, now),
  );

  return (
    <DashboardWidget
      id="google-meet-today"
      title="Salas Google Meet"
      description="Crie ou abra as salas dos atendimentos online de hoje"
      icon={<Video className="size-4" aria-hidden />}
    >
      {rooms.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-5 text-center">
          <Video className="mx-auto size-5 text-muted-foreground" aria-hidden />
          <p className="mt-2 text-sm font-medium text-foreground">
            Nenhuma sala necessária agora
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Os próximos atendimentos online aparecerão aqui com o botão para criar ou abrir o Google Meet.
          </p>
        </div>
      ) : (
        <div className="flex flex-col divide-y divide-border">
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

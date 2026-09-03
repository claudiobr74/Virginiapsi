"use client";

import { Video } from "lucide-react";
import { MeetActionButton } from "@/features/calendar/components/meet-action-button";
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

  // Managed online appointments can create/recover a room. Imported events
  // only belong here when a real Meet URL is already mirrored locally.
  return (
    appointment.origin === "TESSELI" ||
    (appointment.meetStatus === "success" && Boolean(appointment.meetUrl))
  );
}

export function GoogleMeetPanel({
  appointments,
  timeZone,
  now,
}: {
  appointments: MyDayAppointment[];
  timeZone: string;
  now: Date;
}) {
  const rooms = appointments.filter((appointment) =>
    isRelevantMeetAppointment(appointment, now),
  );

  if (rooms.length === 0) {
    return null;
  }

  return (
    <DashboardWidget
      id="google-meet-today"
      title="Google Meet"
      description="Atendimentos online de hoje"
      icon={<Video className="size-4" aria-hidden />}
    >
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
              size="sm"
              variant="secondary"
              className="shrink-0"
            />
          </div>
        ))}
      </div>
    </DashboardWidget>
  );
}

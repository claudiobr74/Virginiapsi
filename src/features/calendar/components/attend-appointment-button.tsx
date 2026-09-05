"use client";

import { PlayCircle } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { offersClinicalAppointmentActions } from "@/features/calendar/appointment-visual";
import type { AttendTarget } from "@/features/calendar/attend-target";
import { PatientLinkDrawer } from "@/features/calendar/components/patient-link-drawer";
import { StartSessionButton } from "@/features/sessions/components/start-session-button";

export function AttendAppointmentButton({
  appointment,
  timeZone,
  canStartSession,
  now,
  label = "Atender",
  size = "sm",
  className,
  returnTo = "/app",
}: {
  appointment: AttendTarget;
  timeZone: string;
  canStartSession: boolean;
  now?: Date;
  label?: string;
  size?: "sm" | "md" | "lg" | "icon";
  className?: string;
  returnTo?: string;
}) {
  const [linkerOpen, setLinkerOpen] = useState(false);
  const canOffer =
    canStartSession &&
    offersClinicalAppointmentActions(
      {
        origin: appointment.origin,
        patient_id: appointment.patientId,
        status: appointment.status,
        summarySnapshot: appointment.summarySnapshot,
        googleDeletedAt: appointment.googleDeletedAt,
        googleColorId: appointment.googleColorId,
        googleEventType: appointment.googleEventType,
        unavailableGoogleColorIds: appointment.unavailableGoogleColorIds,
        endsAt: appointment.endsAt,
      },
      now,
    );

  if (!canOffer) {
    return null;
  }

  if (appointment.patientId) {
    return (
      <StartSessionButton
        patientId={appointment.patientId}
        appointmentId={appointment.id}
        label={label}
        size={size}
        className={className}
      />
    );
  }

  return (
    <>
      <Button
        type="button"
        size={size}
        onClick={() => setLinkerOpen(true)}
        className={className}
        aria-label={label}
      >
        <PlayCircle className="size-4" aria-hidden />
        {label}
      </Button>
      <PatientLinkDrawer
        appointment={appointment}
        timeZone={timeZone}
        open={linkerOpen}
        onOpenChange={setLinkerOpen}
        returnTo={returnTo}
      />
    </>
  );
}

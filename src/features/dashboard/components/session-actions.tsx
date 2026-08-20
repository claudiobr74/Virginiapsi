"use client";

import { CheckCircle2, ExternalLink, MessageCircle, Video } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { confirmAppointmentFromMyDayAction } from "@/features/dashboard/actions";
import {
  buildWhatsAppReminderUrl,
  patientDisplayLabel,
  type MyDayAppointment,
} from "@/features/dashboard/contracts";

export function SessionActions({
  appointment,
  timeZone,
}: {
  appointment: MyDayAppointment;
  timeZone: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const patientLabel = patientDisplayLabel(appointment);
  const whatsappUrl =
    appointment.patientPhone && appointment.origin === "TESSELI"
      ? buildWhatsAppReminderUrl(
          appointment.patientPhone,
          appointment.patientPreferredName ?? "",
          appointment.startsAt,
          timeZone,
        )
      : null;
  const meetReady = appointment.meetStatus === "success" && Boolean(appointment.meetUrl);
  const canConfirm =
    appointment.origin === "TESSELI" &&
    appointment.status !== "confirmed" &&
    appointment.status !== "cancelled" &&
    appointment.status !== "completed";

  function confirm() {
    setError(null);
    startTransition(async () => {
      const result = await confirmAppointmentFromMyDayAction(appointment.id);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {error ? (
        <p role="alert" className="text-xs text-failed">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {canConfirm ? (
          <Button type="button" size="sm" variant="secondary" isLoading={isPending} onClick={confirm}>
            <CheckCircle2 className="size-3.5" aria-hidden />
            Confirmar
          </Button>
        ) : null}
        {whatsappUrl ? (
          <Button asChild size="sm" variant="secondary">
            <a href={whatsappUrl} target="_blank" rel="noreferrer">
              <MessageCircle className="size-3.5" aria-hidden />
              Lembrete WhatsApp
            </a>
          </Button>
        ) : appointment.origin === "TESSELI" ? (
          <Button type="button" size="sm" variant="secondary" disabled title="Cadastre o telefone do paciente para enviar o lembrete.">
            <MessageCircle className="size-3.5" aria-hidden />
            Lembrete WhatsApp
          </Button>
        ) : null}
        {meetReady ? (
          <Button asChild size="sm">
            <a href={appointment.meetUrl ?? "#"} target="_blank" rel="noreferrer">
              <Video className="size-3.5" aria-hidden />
              Entrar no Meet
              <ExternalLink className="size-3" aria-hidden />
            </a>
          </Button>
        ) : appointment.meetStatus === "pending" ? (
          <span className="self-center text-xs font-semibold text-pending">Meet em criação…</span>
        ) : null}
      </div>
      <span className="sr-only">{patientLabel}</span>
    </div>
  );
}

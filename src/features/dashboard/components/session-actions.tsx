"use client";

import { CheckCircle2, Copy, MessageCircle, Video } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  confirmAppointmentFromMyDayAction,
  markNoShowFromMyDayAction,
} from "@/features/dashboard/actions";
import {
  buildWhatsAppReminderUrl,
  type MyDayAppointment,
} from "@/features/dashboard/contracts";
import { meetHostLabel } from "@/features/dashboard/stats";
import { offersClinicalAppointmentActions } from "@/features/calendar/appointment-visual";
import { AttendAppointmentButton } from "@/features/calendar/components/attend-appointment-button";
import { MeetActionButton } from "@/features/calendar/components/meet-action-button";
import { cn } from "@/lib/utils/cn";

export function SessionActions({
  appointment,
  timeZone,
  canStartSession,
  tone = "default",
  layout = "full",
}: {
  appointment: MyDayAppointment;
  timeZone: string;
  canStartSession?: boolean;
  tone?: "default" | "onPrimary";
  layout?: "full" | "hero" | "timeline";
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [noShowOpen, setNoShowOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const whatsappUrl =
    appointment.patientPhone && appointment.origin === "TESSELI"
      ? buildWhatsAppReminderUrl(
          appointment.patientPhone,
          appointment.patientPreferredName ?? "",
          appointment.startsAt,
          timeZone,
        )
      : null;
  const canStart =
    Boolean(canStartSession) &&
    offersClinicalAppointmentActions({
      origin: appointment.origin,
      patient_id: appointment.patientId,
      status: appointment.status,
      summarySnapshot: appointment.summarySnapshot,
      googleDeletedAt: appointment.googleDeletedAt,
      googleColorId: appointment.googleColorId,
      googleEventType: appointment.googleEventType,
      unavailableGoogleColorIds: appointment.unavailableGoogleColorIds,
      endsAt: appointment.endsAt,
    });
  const canConfirm =
    appointment.origin === "TESSELI" &&
    appointment.status !== "confirmed" &&
    appointment.status !== "cancelled" &&
    appointment.status !== "completed" &&
    appointment.status !== "no_show";
  const canMarkNoShow =
    appointment.origin === "TESSELI" &&
    appointment.status !== "cancelled" &&
    appointment.status !== "completed" &&
    appointment.status !== "no_show";
  const meetReady = appointment.meetStatus === "success" && Boolean(appointment.meetUrl);
  const onPrimary = tone === "onPrimary";
  const attendButton = canStart ? (
    <AttendAppointmentButton
      appointment={{
        id: appointment.id,
        origin: appointment.origin,
        patientId: appointment.patientId,
        status: appointment.status,
        summarySnapshot: appointment.summarySnapshot,
        startsAt: appointment.startsAt,
        endsAt: appointment.endsAt,
        googleDeletedAt: appointment.googleDeletedAt,
        googleColorId: appointment.googleColorId,
        googleEventType: appointment.googleEventType,
        unavailableGoogleColorIds: appointment.unavailableGoogleColorIds,
      }}
      timeZone={timeZone}
      canStartSession={Boolean(canStartSession)}
      label="Atender"
      size={layout === "hero" ? "lg" : "sm"}
      className={
        layout === "hero" && onPrimary
          ? "rounded-[14px] bg-white px-7 text-[15px] text-primary hover:bg-white/90"
          : layout === "timeline"
            ? "rounded-xl"
            : undefined
      }
      returnTo="/app"
    />
  ) : null;
  const ghostClass = onPrimary
    ? "border border-white/30 bg-transparent text-white hover:bg-white/10"
    : undefined;
  const meetLabel = meetHostLabel(appointment.meetUrl);

  function run(action: () => Promise<{ error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  async function copyMeet() {
    if (!appointment.meetUrl) {
      return;
    }
    try {
      await navigator.clipboard.writeText(appointment.meetUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  const hasTimelineActions = Boolean(whatsappUrl || canConfirm || canStart);

  if (layout === "timeline") {
    if (!hasTimelineActions && !error) {
      return null;
    }
    return (
      <div className="flex flex-wrap items-center gap-2">
        {error ? (
          <p role="alert" className="w-full text-xs text-failed">
            {error}
          </p>
        ) : null}
        {whatsappUrl ? (
          <Button asChild size="sm" variant="secondary">
            <a href={whatsappUrl} target="_blank" rel="noreferrer">
              <MessageCircle className="size-3.5" aria-hidden />
              Lembrete WhatsApp
            </a>
          </Button>
        ) : null}
        {canConfirm ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            isLoading={isPending}
            onClick={() => run(() => confirmAppointmentFromMyDayAction(appointment.id))}
          >
            Confirmar
          </Button>
        ) : null}
        {attendButton}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {error ? (
        <p role="alert" className={cn("text-xs", onPrimary ? "text-white/90" : "text-failed")}>
          {error}
        </p>
      ) : null}

      {layout === "hero" && meetReady && meetLabel ? (
        <div className="flex items-center gap-3 rounded-xl bg-white/10 px-3 py-3">
          <Video className="size-4 shrink-0 text-white" aria-hidden />
          <p className="min-w-0 flex-1 truncate font-mono text-xs text-white">{meetLabel}</p>
          <button
            type="button"
            onClick={() => void copyMeet()}
            className="rounded-md p-1 text-white/80 hover:text-white"
            aria-label={copied ? "Link copiado" : "Copiar link do Meet"}
          >
            <Copy className="size-3.5" aria-hidden />
          </button>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {attendButton}

        {whatsappUrl ? (
          <Button asChild size={layout === "hero" ? "icon" : "sm"} variant="secondary" className={ghostClass}>
            <a href={whatsappUrl} target="_blank" rel="noreferrer" aria-label="Lembrete WhatsApp">
              <MessageCircle className="size-4" aria-hidden />
              {layout === "hero" ? null : "Lembrete WhatsApp"}
            </a>
          </Button>
        ) : appointment.origin === "TESSELI" ? (
          <Button
            type="button"
            size={layout === "hero" ? "icon" : "sm"}
            variant="secondary"
            disabled
            title="Cadastre o telefone do paciente para enviar o lembrete."
            className={ghostClass}
            aria-label="Lembrete WhatsApp"
          >
            <MessageCircle className="size-4" aria-hidden />
            {layout === "hero" ? null : "Lembrete WhatsApp"}
          </Button>
        ) : null}

        {canConfirm ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            isLoading={isPending}
            onClick={() => run(() => confirmAppointmentFromMyDayAction(appointment.id))}
            className={ghostClass}
          >
            {layout === "hero" ? null : <CheckCircle2 className="size-3.5" aria-hidden />}
            Confirmar
          </Button>
        ) : null}

        {layout === "hero" && canMarkNoShow ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="border-white/15 bg-transparent text-[#e8d1d1] hover:bg-white/10"
            onClick={() => setNoShowOpen(true)}
          >
            Marcar Falta
          </Button>
        ) : null}

        {layout !== "hero" ? (
          <MeetActionButton
            appointmentId={appointment.id}
            modality={appointment.modality}
            origin={appointment.origin}
            meetUrl={appointment.meetUrl}
            meetStatus={appointment.meetStatus}
            size="sm"
          />
        ) : null}
      </div>

      <ConfirmDialog
        open={noShowOpen}
        onOpenChange={setNoShowOpen}
        title="Marcar falta?"
        description="A consulta permanece no histórico do dia como faltou. Isso não apaga o paciente nem o prontuário."
        confirmLabel="Marcar falta"
        destructive
        isLoading={isPending}
        onConfirm={() => {
          setNoShowOpen(false);
          run(() => markNoShowFromMyDayAction(appointment.id));
        }}
      />
    </div>
  );
}

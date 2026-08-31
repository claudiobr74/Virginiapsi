"use client";

import { ExternalLink } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DrawerContent, Drawer } from "@/components/ui/drawer";
import { StatusBadge } from "@/components/ui/status-badge";
import { getAppointmentVisualStatus } from "@/features/calendar/appointment-visual";
import { cancelAppointmentAction, updateAppointmentStatusAction } from "@/features/calendar/appointment-actions";
import {
  pushAppointmentToGoogleAction,
  requestMeetForAppointmentAction,
} from "@/features/calendar/sync-actions";
import {
  APPOINTMENT_STATUS_BADGE,
  APPOINTMENT_STATUS_LABELS,
  type AppointmentRow,
} from "@/features/calendar/contracts";
import { MODALITY_LABELS } from "@/features/patients/contracts";
import { StartSessionButton } from "@/features/sessions/components/start-session-button";
import { formatInTimeZone } from "@/lib/utils/timezone";
import { cn } from "@/lib/utils/cn";

export interface AppointmentDetailDrawerProps {
  appointment: AppointmentRow | null;
  timeZone: string;
  googleConnected: boolean;
  /** Clinical session mode is psychologist_admin-only (.cursor/rules/10-clinical-domain.mdc). */
  isAdmin: boolean;
  onClose: () => void;
  onEdit: () => void;
  /** Called after an in-place update (confirm/sync/Meet) — drawer stays open. */
  onRefresh: () => void;
  /** Called after the appointment leaves the active agenda (cancel). */
  onCancelled: () => void;
}

export function AppointmentDetailDrawer({
  appointment: appointmentProp,
  timeZone,
  googleConnected,
  isAdmin,
  onClose,
  onEdit,
  onRefresh,
  onCancelled,
}: AppointmentDetailDrawerProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [appointment, setAppointment] = useState(appointmentProp);

  // Reset local (optimistically-updated) state whenever a different
  // appointment is selected — adjusting state during render instead of an
  // effect avoids the extra commit/render pass (see React docs: "Adjusting
  // some state when a prop changes").
  const [trackedProp, setTrackedProp] = useState(appointmentProp);
  if (appointmentProp !== trackedProp) {
    setTrackedProp(appointmentProp);
    setAppointment(appointmentProp);
  }

  if (!appointment) {
    return null;
  }

  const isExternal = appointment.origin === "GOOGLE_EXTERNAL";
  const visual = getAppointmentVisualStatus(appointment);

  const runInPlace = (
    action: () => Promise<{ error?: string }>,
    optimisticStatus?: AppointmentRow["status"],
  ) => {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) {
        setError(result.error);
        return;
      }
      if (optimisticStatus) {
        setAppointment((prev) => (prev ? { ...prev, status: optimisticStatus } : prev));
      }
      onRefresh();
    });
  };

  const runCancel = () => {
    setError(null);
    startTransition(async () => {
      const result = await cancelAppointmentAction(appointment.id);
      if (result.error) {
        setError(result.error);
        return;
      }
      setConfirmCancel(false);
      onCancelled();
    });
  };

  return (
    <Drawer open={Boolean(appointmentProp)} onOpenChange={(next) => !next && onClose()}>
      <DrawerContent
        title={isExternal ? "Evento externo do Google" : "Detalhes da consulta"}
        description={appointment.summary_snapshot ?? undefined}
      >
        <div className="flex flex-col gap-4">
          {error ? (
            <p
              role="alert"
              className="rounded-xl border border-failed/30 bg-failed-bg px-4 py-3 text-sm text-failed"
            >
              {error}
            </p>
          ) : null}

          <div
            data-appointment-visual={visual.tone}
            className={cn(
              "flex flex-wrap items-center gap-2 rounded-2xl border px-3 py-2.5",
              visual.className,
              visual.tone === "neutral" && "border-dashed",
            )}
          >
            {isExternal ? (
              <StatusBadge status="info" label="Somente leitura" />
            ) : (
              <StatusBadge
                status={APPOINTMENT_STATUS_BADGE[appointment.status]}
                label={APPOINTMENT_STATUS_LABELS[appointment.status]}
              />
            )}
            <p className={cn("text-sm font-semibold", visual.titleClassName)}>
              {appointment.summary_snapshot ?? "Sem paciente vinculado"}
            </p>
          </div>

          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-xs font-bold uppercase text-muted-foreground">Início</dt>
              <dd className="font-mono text-foreground">
                {formatInTimeZone(appointment.starts_at, timeZone, {
                  day: "2-digit",
                  month: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-bold uppercase text-muted-foreground">Fim</dt>
              <dd className="font-mono text-foreground">
                {formatInTimeZone(appointment.ends_at, timeZone, {
                  day: "2-digit",
                  month: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-bold uppercase text-muted-foreground">Modalidade</dt>
              <dd className="text-foreground">{MODALITY_LABELS[appointment.modality]}</dd>
            </div>
          </dl>

          {isExternal ? (
            <p className="text-sm text-muted-foreground">
              Este evento vem do Google Calendar e é somente leitura no VirgíniaPsi.
              Edite-o diretamente no Google.
            </p>
          ) : (
            <>
              {appointment.modality === "online" ? (
                <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface/50 p-3">
                  <span className="text-xs font-bold uppercase text-muted-foreground">
                    Google Meet
                  </span>
                  {appointment.meet_status === "success" && appointment.meet_url ? (
                    <a
                      href={appointment.meet_url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1.5 text-sm font-semibold text-sage-700 hover:text-primary"
                    >
                      {appointment.meet_url}
                      <ExternalLink className="size-3.5" aria-hidden />
                    </a>
                  ) : appointment.meet_status === "pending" ? (
                    <span className="text-sm text-pending">Meet em criação…</span>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      isLoading={isPending}
                      disabled={!googleConnected || !appointment.google_event_id}
                      onClick={() =>
                        runInPlace(() => requestMeetForAppointmentAction(appointment.id))
                      }
                    >
                      Criar Meet
                    </Button>
                  )}
                  {!appointment.google_event_id ? (
                    <p className="text-xs text-muted-foreground">
                      Sincronize com o Google Calendar antes de criar o Meet.
                    </p>
                  ) : null}
                </div>
              ) : null}

              {isAdmin && appointment.patient_id && appointment.status !== "cancelled" ? (
                <StartSessionButton
                  patientId={appointment.patient_id}
                  appointmentId={appointment.id}
                />
              ) : null}

              <div className="flex flex-wrap gap-2">
                {!appointment.google_event_id ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    isLoading={isPending}
                    disabled={!googleConnected}
                    onClick={() => runInPlace(() => pushAppointmentToGoogleAction(appointment.id))}
                  >
                    Sincronizar com Google
                  </Button>
                ) : null}
                {appointment.status !== "confirmed" && appointment.status !== "cancelled" ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    isLoading={isPending}
                    onClick={() =>
                      runInPlace(
                        () => updateAppointmentStatusAction(appointment.id, "confirmed"),
                        "confirmed",
                      )
                    }
                  >
                    Confirmar
                  </Button>
                ) : null}
                <Button type="button" size="sm" variant="secondary" onClick={onEdit}>
                  Remarcar
                </Button>
                {appointment.status !== "cancelled" ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    onClick={() => setConfirmCancel(true)}
                  >
                    Cancelar consulta
                  </Button>
                ) : null}
              </div>
            </>
          )}
        </div>
      </DrawerContent>

      <ConfirmDialog
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        title="Cancelar consulta?"
        description="O paciente e o horário ficam registrados, mas a consulta some da agenda ativa."
        confirmLabel="Cancelar consulta"
        isLoading={isPending}
        onConfirm={runCancel}
      />
    </Drawer>
  );
}

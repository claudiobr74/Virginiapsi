"use client";

import { ExternalLink } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DrawerContent, Drawer } from "@/components/ui/drawer";
import {
  cancelAppointmentAction,
  deleteAppointmentAction,
  retryGoogleSyncAction,
  updateAppointmentStatusAction,
} from "@/features/calendar/appointment-actions";
import {
  getAppointmentVisualStatus,
  offersClinicalAppointmentActions,
} from "@/features/calendar/appointment-visual";
import { appointmentRowToAttendTarget } from "@/features/calendar/attend-target";
import { AttendAppointmentButton } from "@/features/calendar/components/attend-appointment-button";
import { GoogleOriginMark } from "@/features/calendar/components/google-origin-mark";
import { requestMeetForAppointmentAction } from "@/features/calendar/sync-actions";
import type { AppointmentRow } from "@/features/calendar/contracts";
import { MODALITY_LABELS } from "@/features/patients/contracts";
import { formatInTimeZone } from "@/lib/utils/timezone";
import { cn } from "@/lib/utils/cn";

export interface AppointmentDetailDrawerProps {
  appointment: AppointmentRow | null;
  timeZone: string;
  googleConnected: boolean;
  /** Clinical session mode is psychologist_admin-only (.cursor/rules/10-clinical-domain.mdc). */
  isAdmin: boolean;
  now?: Date;
  onClose: () => void;
  onEdit: () => void;
  /** Called after an in-place update (confirm/sync/Meet) — drawer stays open. */
  onRefresh: () => void;
  /** Called after cancel or delete. */
  onCancelled: () => void;
}

export function AppointmentDetailDrawer({
  appointment: appointmentProp,
  timeZone,
  googleConnected,
  isAdmin,
  now,
  onClose,
  onEdit,
  onRefresh,
  onCancelled,
}: AppointmentDetailDrawerProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [appointment, setAppointment] = useState(appointmentProp);

  const [trackedProp, setTrackedProp] = useState(appointmentProp);
  if (appointmentProp !== trackedProp) {
    setTrackedProp(appointmentProp);
    setAppointment(appointmentProp);
    setError(null);
  }

  if (!appointment) {
    return null;
  }

  const visual = getAppointmentVisualStatus(appointment, now);
  const blocked =
    visual.tone === "cancelled" || visual.tone === "unavailable";
  const hasGoogleEvent = Boolean(appointment.google_event_id);
  const canConfirm = !blocked && appointment.status !== "confirmed";
  const canStart =
    isAdmin && offersClinicalAppointmentActions(appointment, now);

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

  const runDelete = () => {
    setError(null);
    startTransition(async () => {
      const result = await deleteAppointmentAction(appointment.id);
      if (result.error) {
        setError(result.error);
        return;
      }
      setConfirmDelete(false);
      onCancelled();
    });
  };

  return (
    <Drawer open={Boolean(appointmentProp)} onOpenChange={(next) => !next && onClose()}>
      <DrawerContent
        title="Detalhes do agendamento"
        description={appointment.summary_snapshot ?? undefined}
        tone="agenda"
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
            data-appointment-origin={appointment.origin}
            style={visual.style}
            className={cn("flex flex-col gap-1 rounded-lg px-3 py-2.5", visual.className)}
          >
            <p className="text-sm font-semibold leading-snug break-words text-white">
              {appointment.summary_snapshot ?? "Sem paciente vinculado"}
            </p>
            <p className="font-mono text-xs text-white/90">
              {formatInTimeZone(appointment.starts_at, timeZone)} –{" "}
              {formatInTimeZone(appointment.ends_at, timeZone)}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {visual.badge ? <GoogleOriginMark /> : null}
              <span className="text-[10px] font-semibold uppercase tracking-wide text-white/85">
                {visual.statusLabel}
              </span>
            </div>
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

          {appointment.origin === "TESSELI" && appointment.modality === "online" ? (
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
            </div>
          ) : null}

          {canStart ? (
            <AttendAppointmentButton
              appointment={appointmentRowToAttendTarget(appointment)}
              timeZone={timeZone}
              canStartSession={isAdmin}
              now={now}
              returnTo="/app/agenda"
            />
          ) : null}

          {appointment.sync_status === "error" ? (
            <div className="flex flex-col gap-2 rounded-xl border border-failed/30 bg-failed-bg px-4 py-3 text-sm text-failed">
              <p>Não foi possível sincronizar com Google.</p>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                isLoading={isPending}
                onClick={() => runInPlace(() => retryGoogleSyncAction(appointment.id))}
              >
                Tentar novamente
              </Button>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {canConfirm ? (
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
              Editar
            </Button>
            {!blocked ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => setConfirmCancel(true)}
              >
                Cancelar/desmarcar
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="destructive"
              onClick={() => setConfirmDelete(true)}
            >
              Excluir
            </Button>
          </div>
        </div>
      </DrawerContent>

      <ConfirmDialog
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        title="Cancelar/desmarcar este agendamento?"
        description="O agendamento permanece visível na Agenda em vermelho. Isso não exclui o evento."
        confirmLabel="Cancelar/desmarcar"
        isLoading={isPending}
        onConfirm={runCancel}
      />

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Excluir este agendamento?"
        description={
          hasGoogleEvent
            ? "Ele também será removido do Google Calendar."
            : "Esta ação remove o agendamento da agenda."
        }
        confirmLabel="Excluir agendamento"
        isLoading={isPending}
        onConfirm={runDelete}
      />
    </Drawer>
  );
}

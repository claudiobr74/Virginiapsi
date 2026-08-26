"use client";

import { CalendarCheck2, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Modal, ModalContent } from "@/components/ui/modal";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  disconnectGoogleAction,
  listCalendarsAction,
  selectCalendarAction,
  startGoogleConnectionAction,
  type CalendarOption,
} from "@/features/calendar/connection-actions";
import { syncGoogleCalendarAction } from "@/features/calendar/sync-actions";
import type { ConnectionRow } from "@/features/calendar/contracts";

const STATUS_LABELS = {
  connected: "Conectado",
  disconnected: "Desconectado",
  error: "Com erro",
} as const;

export function ConnectionPanel({
  connection,
  canManage,
  calendarRedirectUri,
}: {
  connection: ConnectionRow | null;
  canManage: boolean;
  calendarRedirectUri?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [calendarModalOpen, setCalendarModalOpen] = useState(false);
  const [calendars, setCalendars] = useState<CalendarOption[] | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  const status = connection?.status ?? "disconnected";

  function openCalendarModal() {
    setCalendarModalOpen(true);
    setError(null);
    setCalendars(null);
    startTransition(async () => {
      const result = await listCalendarsAction();
      if (result.error) {
        setError(result.error);
        setCalendars([]);
        return;
      }
      setCalendars(result.calendars ?? []);
    });
  }

  function selectCalendar(calendar: CalendarOption) {
    startTransition(async () => {
      const result = await selectCalendarAction(calendar.id, calendar.summary);
      if (result.error) {
        setError(result.error);
        return;
      }
      setCalendarModalOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-5 rounded-3xl border border-border bg-card p-6">
      {error ? (
        <p
          role="alert"
          className="rounded-xl border border-failed/30 bg-failed-bg px-4 py-3 text-sm text-failed"
        >
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <StatusBadge
            status={status === "connected" ? "active" : status === "error" ? "failed" : "cancelled"}
            label={STATUS_LABELS[status]}
          />
          {connection?.google_account_email ? (
            <span className="text-sm text-muted-foreground">
              {connection.google_account_email}
            </span>
          ) : null}
        </div>

        {canManage ? (
          status === "connected" ? (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => setConfirmDisconnect(true)}
            >
              Desconectar
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              isLoading={isPending}
              onClick={() =>
                startTransition(async () => {
                  const result = await startGoogleConnectionAction();
                  if (result?.error) {
                    setError(result.error);
                  }
                })
              }
            >
              Conectar com o Google
            </Button>
          )
        ) : null}
      </div>

      {calendarRedirectUri && status !== "connected" ? (
        <p className="text-sm text-muted-foreground">
          Cadastre este endereço no Google Cloud, em URIs de redirecionamento
          autorizados. É o retorno da Agenda — diferente do login:{" "}
          <code className="break-all rounded-md bg-muted px-1.5 py-0.5 text-xs text-foreground">
            {calendarRedirectUri}
          </code>
        </p>
      ) : null}

      {status === "connected" ? (
        <div className="flex flex-col gap-3 border-t border-border pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm">
              <CalendarCheck2 className="size-4 text-sage-700" aria-hidden />
              <span className="font-semibold text-foreground">
                {connection?.calendar_summary ?? "Nenhum calendário selecionado"}
              </span>
            </div>
            <Button type="button" variant="secondary" size="sm" onClick={openCalendarModal}>
              Selecionar calendário
            </Button>
          </div>

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {connection?.last_synced_at
                ? `Último sync: ${new Date(connection.last_synced_at).toLocaleString("pt-BR")}`
                : "Ainda não sincronizado"}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              isLoading={isPending}
              disabled={!connection?.calendar_id}
              onClick={() =>
                startTransition(async () => {
                  const result = await syncGoogleCalendarAction();
                  if (result.error) {
                    setError(result.error);
                  } else {
                    router.refresh();
                  }
                })
              }
            >
              <RefreshCw className="size-3.5" aria-hidden />
              Sincronizar agora
            </Button>
          </div>
          {connection?.last_sync_error ? (
            <p className="text-xs text-failed">{connection.last_sync_error}</p>
          ) : null}
        </div>
      ) : null}

      <Modal open={calendarModalOpen} onOpenChange={setCalendarModalOpen}>
        <ModalContent title="Selecionar calendário" description="Escolha qual calendário do Google usar para a Agenda.">
          {calendars === null ? (
            <p className="text-sm text-muted-foreground">Carregando calendários…</p>
          ) : error ? (
            <div className="flex flex-col gap-3">
              <p role="alert" className="text-sm text-failed">
                {error}
              </p>
              <Button type="button" variant="secondary" size="sm" onClick={openCalendarModal}>
                Tentar de novo
              </Button>
            </div>
          ) : calendars.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum calendário encontrado.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {calendars.map((calendar) => (
                <Button
                  key={calendar.id}
                  type="button"
                  variant="secondary"
                  className="justify-start"
                  isLoading={isPending}
                  onClick={() => selectCalendar(calendar)}
                >
                  {calendar.summary}
                  {calendar.primary ? " (principal)" : ""}
                </Button>
              ))}
            </div>
          )}
        </ModalContent>
      </Modal>

      <ConfirmDialog
        open={confirmDisconnect}
        onOpenChange={setConfirmDisconnect}
        title="Desconectar Google Calendar?"
        description="A Agenda deixa de sincronizar eventos externos e de criar Meet até reconectar."
        confirmLabel="Desconectar"
        isLoading={isPending}
        onConfirm={() =>
          startTransition(async () => {
            const result = await disconnectGoogleAction();
            if (result.error) {
              setError(result.error);
              return;
            }
            setConfirmDisconnect(false);
            router.refresh();
          })
        }
      />
    </div>
  );
}

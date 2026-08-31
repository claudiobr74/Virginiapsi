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
import { syncGoogleCalendarAction, type SyncActionResult } from "@/features/calendar/sync-actions";
import type { ConnectionRow } from "@/features/calendar/contracts";
import type { GoogleOAuthReturnTo } from "@/features/calendar/oauth-callback";
import { formatInTimeZone } from "@/lib/utils/timezone";

const STATUS_LABELS = {
  connected: "Conectado",
  disconnected: "Não conectado",
  error: "Com erro",
} as const;

export function ConnectionPanel({
  connection,
  canManage,
  calendarRedirectUri,
  oauthReturnTo = "agenda",
  framed = true,
  timeZone = "America/Sao_Paulo",
}: {
  connection: ConnectionRow | null;
  canManage: boolean;
  calendarRedirectUri?: string;
  oauthReturnTo?: GoogleOAuthReturnTo;
  framed?: boolean;
  timeZone?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [syncSummary, setSyncSummary] = useState<string | null>(null);
  const [calendarModalOpen, setCalendarModalOpen] = useState(false);
  const [calendars, setCalendars] = useState<CalendarOption[] | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  const status = connection?.status ?? "disconnected";

  function startConnect() {
    startTransition(async () => {
      const result = await startGoogleConnectionAction(oauthReturnTo);
      if (result?.error) {
        setError(result.error);
      }
    });
  }

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

  function runSync() {
    setError(null);
    setSyncSummary(null);
    startTransition(async () => {
      const result = await syncGoogleCalendarAction();
      if (result.error && !(result.importedCount || result.pushedCount)) {
        setError(result.error);
        return;
      }
      setSyncSummary(formatSyncSummary(result, timeZone));
      if (result.error) {
        setError(result.error);
      }
      router.refresh();
    });
  }

  return (
    <div
      className={
        framed
          ? "flex flex-col gap-5 rounded-3xl border border-border bg-card p-6"
          : "flex flex-col gap-5"
      }
    >
      {error ? (
        <p
          role="alert"
          className="rounded-xl border border-failed/30 bg-failed-bg px-4 py-3 text-sm text-failed"
        >
          {error}
        </p>
      ) : null}

      {syncSummary ? (
        <p role="status" className="rounded-xl border border-success/30 bg-success-bg px-4 py-3 text-sm text-success">
          {syncSummary}
        </p>
      ) : null}

      <div className="flex flex-col gap-1">
        <p className="text-xs font-bold uppercase tracking-wide text-deep-neutral">Status</p>
        <StatusBadge
          status={status === "connected" ? "active" : status === "error" ? "failed" : "cancelled"}
          label={STATUS_LABELS[status]}
        />
      </div>

      {status === "disconnected" ? (
        <p className="text-sm text-muted-foreground">
          Conecte uma conta Google para sincronizar seus compromissos.
        </p>
      ) : null}

      {connection?.google_account_email ? (
        <div className="flex flex-col gap-1">
          <p className="text-xs font-bold uppercase tracking-wide text-deep-neutral">Conta Google</p>
          <p className="text-sm text-foreground">{connection.google_account_email}</p>
        </div>
      ) : null}

      {status === "connected" ? (
        <div className="flex flex-col gap-1">
          <p className="text-xs font-bold uppercase tracking-wide text-deep-neutral">
            Agenda selecionada
          </p>
          <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <CalendarCheck2 className="size-4 text-sage-700" aria-hidden />
            {connection?.calendar_summary ?? "Nenhuma agenda selecionada"}
          </p>
        </div>
      ) : null}

      <div className="flex flex-col gap-1">
        <p className="text-xs font-bold uppercase tracking-wide text-deep-neutral">
          Última sincronização
        </p>
        <p className="text-sm text-muted-foreground">
          {connection?.last_synced_at
            ? formatInTimeZone(connection.last_synced_at, timeZone, {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })
            : "Ainda não sincronizado"}
        </p>
      </div>

      {connection?.last_sync_error ? (
        <div className="rounded-xl border border-failed/30 bg-failed-bg px-4 py-3">
          <p className="text-sm font-semibold text-failed">Falha na última sincronização</p>
          <p className="mt-1 text-sm text-failed">{connection.last_sync_error}</p>
        </div>
      ) : null}

      {calendarRedirectUri && status !== "connected" ? (
        <p className="text-sm text-muted-foreground">
          Cadastre este endereço no Google Cloud, em URIs de redirecionamento
          autorizados. É o retorno da Agenda — diferente do login:{" "}
          <code className="break-all rounded-md bg-muted px-1.5 py-0.5 text-xs text-foreground">
            {calendarRedirectUri}
          </code>
        </p>
      ) : null}

      {canManage ? (
        <div className="flex flex-wrap items-center gap-2">
          {status === "disconnected" ? (
            <Button type="button" size="sm" isLoading={isPending} onClick={startConnect}>
              Conectar Google Agenda
            </Button>
          ) : null}
          {status === "connected" || status === "error" ? (
            <>
              <Button
                type="button"
                size="sm"
                isLoading={isPending}
                disabled={!connection?.calendar_id}
                onClick={runSync}
              >
                <RefreshCw className="size-3.5" aria-hidden />
                {connection?.last_sync_error ? "Tentar novamente" : "Sincronizar agora"}
              </Button>
              {status === "connected" ? (
                <Button type="button" variant="secondary" size="sm" onClick={openCalendarModal}>
                  Trocar agenda
                </Button>
              ) : null}
              <Button type="button" variant="secondary" size="sm" isLoading={isPending} onClick={startConnect}>
                Reconectar
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => setConfirmDisconnect(true)}
              >
                Desconectar
              </Button>
            </>
          ) : null}
        </div>
      ) : null}

      <Modal open={calendarModalOpen} onOpenChange={setCalendarModalOpen}>
        <ModalContent title="Trocar agenda" description="Escolha qual calendário do Google usar para a Agenda.">
          {calendars === null ? (
            <p className="text-sm text-muted-foreground">Carregando agendas…</p>
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
            <p className="text-sm text-muted-foreground">Nenhuma agenda encontrada.</p>
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
        title="Deseja desconectar o Google Agenda?"
        description="Os compromissos já existentes no VirgíniaPsi serão preservados. Novas alterações deixarão de ser sincronizadas."
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

function formatSyncSummary(result: SyncActionResult, timeZone: string): string {
  const imported = result.importedCount ?? 0;
  const updated = result.updatedCount ?? 0;
  const errors = result.pushErrors ?? 0;
  const when = result.lastSyncedAt
    ? formatInTimeZone(result.lastSyncedAt, timeZone, {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;
  const lines = [
    "Sincronização concluída",
    `${updated} eventos atualizados`,
    `${imported} novos eventos`,
    `${errors} erros`,
  ];
  if (when) {
    lines.push(when);
  }
  return lines.join(". ");
}

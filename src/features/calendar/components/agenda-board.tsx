"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { AgendaToolbar } from "@/features/calendar/components/agenda-toolbar";
import { AppointmentDetailDrawer } from "@/features/calendar/components/appointment-detail-drawer";
import { AppointmentDialog } from "@/features/calendar/components/appointment-dialog";
import { ConnectionStatusBanner } from "@/features/calendar/components/connection-status-banner";
import { DayView } from "@/features/calendar/components/day-view";
import { MonthView } from "@/features/calendar/components/month-view";
import { WeekView } from "@/features/calendar/components/week-view";
import type { ConnectionRow, AppointmentRow } from "@/features/calendar/contracts";
import {
  computeAgendaWindow,
  shiftReferenceDate,
  todayInTimeZone,
  type AgendaView,
} from "@/features/calendar/date-window";
import { formatAgendaLongDate, formatAgendaMonthLabel } from "@/features/calendar/display";
import { syncGoogleCalendarAction } from "@/features/calendar/sync-actions";
import type { PatientRow } from "@/features/patients/contracts";
import { pageHeading } from "@/lib/brand";

export interface AgendaBoardProps {
  view: AgendaView;
  referenceDate: string;
  timeZone: string;
  appointments: AppointmentRow[];
  patients: Pick<PatientRow, "id" | "preferred_name" | "public_code">[];
  connection: ConnectionRow | null;
  canManageConnection: boolean;
  canStartSession?: boolean;
}

function rangeLabel(view: AgendaView, days: string[], timeZone: string): string {
  if (view === "day") {
    return formatAgendaLongDate(days[0], timeZone);
  }
  if (view === "month") {
    return formatAgendaMonthLabel(days[0], timeZone);
  }
  const format = (value: string) => {
    const [, month, day] = value.split("-");
    return `${day}/${month}`;
  };
  return `${format(days[0])} – ${format(days.at(-1)!)}`;
}

export function AgendaBoard({
  view,
  referenceDate,
  timeZone,
  appointments,
  patients,
  connection,
  canManageConnection,
  canStartSession = false,
}: AgendaBoardProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  const [dialogState, setDialogState] = useState<{
    open: boolean;
    appointment?: AppointmentRow;
    date: string;
  }>({ open: false, date: referenceDate });
  const [selectedAppointment, setSelectedAppointment] = useState<AppointmentRow | null>(
    null,
  );

  const window = useMemo(
    () => computeAgendaWindow(view, referenceDate, timeZone),
    [view, referenceDate, timeZone],
  );
  const today = todayInTimeZone(timeZone);
  const openFromQuery = searchParams.get("new") === "1";

  const appointmentsByDay = useMemo(() => {
    const map = new Map<string, AppointmentRow[]>();
    for (const appointment of appointments) {
      const day = appointment.starts_at.slice(0, 10);
      const list = map.get(day) ?? [];
      list.push(appointment);
      map.set(day, list);
    }
    return map;
  }, [appointments]);

  function pushParams(nextView: AgendaView, nextDate: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", nextView);
    params.set("date", nextDate);
    startTransition(() => {
      router.push(`/app/agenda?${params.toString()}`);
    });
  }

  function handleSync() {
    setIsSyncing(true);
    setSyncError(null);
    startTransition(async () => {
      const result = await syncGoogleCalendarAction();
      setIsSyncing(false);
      if (result.error) {
        setSyncError(result.error);
      }
    });
  }

  const canSync = connection?.status === "connected" && Boolean(connection.calendar_id);

  return (
    <div className="flex flex-col gap-5">
      <h1 className="font-serif text-[28px] font-bold leading-tight text-foreground">
        {pageHeading("/app/agenda", { view })}
      </h1>

      <ConnectionStatusBanner connection={connection} canManage={canManageConnection} />

      {syncError ? (
        <p
          role="alert"
          className="rounded-xl border border-failed/30 bg-failed-bg px-4 py-3 text-sm text-failed"
        >
          {syncError}
        </p>
      ) : null}

      <AgendaToolbar
        view={view}
        onViewChange={(nextView) => pushParams(nextView, referenceDate)}
        onToday={() => pushParams(view, today)}
        onNavigate={(direction) =>
          pushParams(view, shiftReferenceDate(view, referenceDate, direction))
        }
        onNewAppointment={() =>
          setDialogState({ open: true, appointment: undefined, date: referenceDate })
        }
        onSync={canManageConnection || connection ? handleSync : undefined}
        isSyncing={isSyncing}
        canSync={canSync}
        rangeLabel={rangeLabel(view, window.days, timeZone)}
      />

      {view === "day" ? (
        <DayView
          appointments={appointmentsByDay.get(referenceDate) ?? []}
          timeZone={timeZone}
          isAdmin={canStartSession}
          onSelect={setSelectedAppointment}
        />
      ) : view === "week" ? (
        <WeekView
          days={window.days}
          appointmentsByDay={appointmentsByDay}
          timeZone={timeZone}
          today={today}
          isAdmin={canStartSession}
          onSelect={setSelectedAppointment}
        />
      ) : (
        <MonthView
          days={window.days}
          appointmentsByDay={appointmentsByDay}
          today={today}
          onSelectDay={(day) => pushParams("day", day)}
        />
      )}

      <AppointmentDialog
        open={dialogState.open || openFromQuery}
        onOpenChange={(open) => {
          setDialogState((state) => ({
            ...state,
            open,
            appointment: open ? state.appointment : undefined,
            date: referenceDate,
          }));
          if (!open && openFromQuery) {
            const params = new URLSearchParams(searchParams.toString());
            params.delete("new");
            const query = params.toString();
            router.replace(query ? `/app/agenda?${query}` : "/app/agenda");
          }
        }}
        patients={patients}
        defaultDate={dialogState.date}
        appointment={openFromQuery ? undefined : dialogState.appointment}
        onSaved={() => router.refresh()}
      />

      <AppointmentDetailDrawer
        appointment={selectedAppointment}
        timeZone={timeZone}
        googleConnected={canSync}
        isAdmin={canStartSession}
        onClose={() => setSelectedAppointment(null)}
        onEdit={() => {
          if (!selectedAppointment) return;
          setDialogState({
            open: true,
            appointment: selectedAppointment,
            date: selectedAppointment.starts_at.slice(0, 10),
          });
          setSelectedAppointment(null);
        }}
        onRefresh={() => router.refresh()}
        onCancelled={() => {
          setSelectedAppointment(null);
          router.refresh();
        }}
      />
    </div>
  );
}

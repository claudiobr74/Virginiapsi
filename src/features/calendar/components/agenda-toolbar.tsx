"use client";

import { ChevronLeft, ChevronRight, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AgendaView } from "@/features/calendar/date-window";
import { cn } from "@/lib/utils/cn";

const VIEW_LABELS: Record<AgendaView, string> = {
  day: "Dia",
  week: "Semana",
  month: "Mês",
};

export function AgendaToolbar({
  view,
  onViewChange,
  onToday,
  onNavigate,
  onNewAppointment,
  onSync,
  isSyncing,
  canSync,
  rangeLabel,
}: {
  view: AgendaView;
  onViewChange: (view: AgendaView) => void;
  onToday: () => void;
  onNavigate: (direction: 1 | -1) => void;
  onNewAppointment: () => void;
  onSync?: () => void;
  isSyncing?: boolean;
  canSync?: boolean;
  rangeLabel: string;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-3xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2">
        <div className="flex rounded-xl border border-border p-0.5">
          {(Object.keys(VIEW_LABELS) as AgendaView[]).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => onViewChange(value)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors",
                view === value
                  ? "bg-primary text-primary-foreground"
                  : "text-deep-neutral hover:bg-surface",
              )}
            >
              {VIEW_LABELS[value]}
            </button>
          ))}
        </div>
        <Button type="button" size="sm" variant="ghost" onClick={() => onNavigate(-1)}>
          <ChevronLeft className="size-4" aria-hidden />
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={onToday}>
          Hoje
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => onNavigate(1)}>
          <ChevronRight className="size-4" aria-hidden />
        </Button>
        <span className="hidden text-sm font-semibold text-foreground sm:inline">
          {rangeLabel}
        </span>
      </div>

      <div className="flex items-center gap-2">
        {onSync ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            isLoading={isSyncing}
            disabled={!canSync}
            onClick={onSync}
          >
            <RefreshCw className="size-4" aria-hidden />
            Sincronizar agora
          </Button>
        ) : null}
        <Button type="button" size="sm" onClick={onNewAppointment}>
          <Plus className="size-4" aria-hidden />
          Nova consulta
        </Button>
      </div>
    </div>
  );
}

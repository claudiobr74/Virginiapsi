"use client";

import { ChevronLeft, ChevronRight, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AgendaLegend } from "@/features/calendar/components/agenda-legend";
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
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="secondary" onClick={onToday}>
          Hoje
        </Button>
        <div className="flex items-center">
          <Button type="button" size="icon" variant="ghost" onClick={() => onNavigate(-1)}>
            <ChevronLeft className="size-4" aria-hidden />
            <span className="sr-only">Anterior</span>
          </Button>
          <Button type="button" size="icon" variant="ghost" onClick={() => onNavigate(1)}>
            <ChevronRight className="size-4" aria-hidden />
            <span className="sr-only">Próximo</span>
          </Button>
        </div>
        <span className="font-serif text-lg italic font-medium text-foreground">{rangeLabel}</span>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <AgendaLegend />
        <div className="flex rounded-xl border border-border bg-surface/60 p-1">
          {(Object.keys(VIEW_LABELS) as AgendaView[]).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={view === value}
              onClick={() => onViewChange(value)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors",
                view === value
                  ? "bg-primary text-primary-foreground"
                  : "text-deep-neutral hover:bg-card",
              )}
            >
              {VIEW_LABELS[value]}
            </button>
          ))}
        </div>
        {onSync ? (
          <Button
            type="button"
            size="icon"
            variant="secondary"
            isLoading={isSyncing}
            disabled={!canSync}
            onClick={onSync}
            aria-label="Sincronizar agora"
          >
            <RefreshCw className="size-4" aria-hidden />
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

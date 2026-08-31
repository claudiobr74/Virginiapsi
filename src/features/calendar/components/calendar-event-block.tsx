"use client";

import { useId, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import type { AppointmentRow } from "@/features/calendar/contracts";
import {
  civilDateInTimeZone,
  formatAgendaLongDate,
} from "@/features/calendar/display";
import {
  calendarEventAriaLabel,
  calendarEventSurfaceClass,
  calendarEventTitle,
  calendarEventTone,
  calendarStatusLabel,
  formatAgendaTimeRange,
  isCancelledAppointment,
} from "@/features/calendar/event-appearance";
import { MODALITY_LABELS } from "@/features/patients/contracts";
import { formatInTimeZone } from "@/lib/utils/timezone";
import { cn } from "@/lib/utils/cn";

export type CalendarEventDensity = "month" | "week" | "day" | "stack";

export function CalendarEventBlock({
  appointment,
  timeZone,
  density,
  selected = false,
  style,
  className,
  onSelect,
}: {
  appointment: AppointmentRow;
  timeZone: string;
  density: CalendarEventDensity;
  selected?: boolean;
  style?: CSSProperties;
  className?: string;
  onSelect: (appointment: AppointmentRow) => void;
}) {
  const tooltipId = useId();
  const [tip, setTip] = useState<{ left: number; top: number } | null>(null);
  const tone = calendarEventTone(appointment);
  const title = calendarEventTitle(appointment);
  const cancelled = isCancelledAppointment(appointment);
  const statusLabel = calendarStatusLabel(appointment);
  const range = formatAgendaTimeRange(appointment.starts_at, appointment.ends_at, timeZone);
  const startTime = formatInTimeZone(appointment.starts_at, timeZone);
  const ariaLabel = calendarEventAriaLabel(appointment, timeZone);
  const heightPx = typeof style?.height === "number" ? style.height : undefined;
  const isExternal = appointment.origin === "GOOGLE_EXTERNAL";
  const typeLine = isExternal ? "Evento externo do Google" : MODALITY_LABELS[appointment.modality];
  const showType =
    density === "day" ||
    density === "stack" ||
    (density === "week" && (heightPx === undefined || heightPx >= 40));
  const showRange =
    density === "day" ||
    density === "stack" ||
    (density === "week" && (heightPx === undefined || heightPx >= 52));
  const showStatus =
    density === "day" ||
    (density === "week" && (heightPx === undefined || heightPx >= 68)) ||
    (density === "stack" && cancelled);

  function hideTip() {
    setTip(null);
  }

  function showTip(target: HTMLElement) {
    const rect = target.getBoundingClientRect();
    const width = 240;
    const left = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8);
    const top = rect.bottom + 6;
    const flip = top + 160 > window.innerHeight;
    setTip({
      left,
      top: flip ? Math.max(8, rect.top - 166) : top,
    });
  }

  return (
    <>
      <button
        type="button"
        data-calendar-tone={tone}
        data-selected={selected ? "true" : "false"}
        aria-label={ariaLabel}
        aria-describedby={tip ? tooltipId : undefined}
        onClick={(event) => {
          event.stopPropagation();
          hideTip();
          onSelect(appointment);
        }}
        onMouseEnter={(event) => showTip(event.currentTarget)}
        onMouseLeave={hideTip}
        onFocus={(event) => showTip(event.currentTarget)}
        onBlur={hideTip}
        style={{ borderRadius: "var(--cal-event-radius)", ...style }}
        className={cn(
          "block min-w-0 overflow-hidden text-left shadow-none transition-colors duration-150",
          "cursor-pointer focus-visible:outline-none",
          calendarEventSurfaceClass(tone),
          selected && "outline outline-2 outline-offset-1 outline-foreground",
          density === "month" && "w-full px-1 py-px",
          density === "week" && "px-1.5 py-0.5",
          (density === "stack" || density === "day") && "w-full px-2 py-1",
          className,
        )}
      >
        {density === "month" ? (
          <span className="flex min-w-0 items-baseline gap-1 text-[11px] leading-4">
            <span className="shrink-0 font-mono tabular-nums">{startTime}</span>
            <span className={cn("min-w-0 truncate font-medium", cancelled && "line-through")}>
              {title}
            </span>
          </span>
        ) : (
          <span
            className={cn(
              "flex flex-col",
              density === "week" ? "gap-0 text-[11px] leading-tight" : "gap-0.5 text-[12px] leading-tight",
            )}
          >
            <span className={cn("truncate font-semibold", cancelled && "line-through")}>{title}</span>
            {showType ? <span className="truncate opacity-90">{typeLine}</span> : null}
            {showRange ? (
              <span className="font-mono text-[11px] tabular-nums opacity-90">{range}</span>
            ) : null}
            {showStatus ? <span className="truncate text-[11px] opacity-90">{statusLabel}</span> : null}
          </span>
        )}
      </button>
      {tip && typeof document !== "undefined"
        ? createPortal(
            <div
              id={tooltipId}
              role="tooltip"
              style={{ left: tip.left, top: tip.top, borderRadius: "var(--cal-event-radius)" }}
              className="pointer-events-none fixed z-[80] w-[240px] border border-border bg-card px-3 py-2.5 text-left shadow-sm"
            >
              <p className={cn("text-sm font-semibold text-foreground", cancelled && "line-through")}>
                {title}
              </p>
              <p className="mt-1 text-[12px] text-muted-foreground">
                {formatAgendaLongDate(
                  civilDateInTimeZone(appointment.starts_at, timeZone),
                  timeZone,
                )}
              </p>
              <p className="font-mono text-[12px] tabular-nums text-foreground">{range}</p>
              <p className="mt-1 text-[12px] text-muted-foreground">{typeLine}</p>
              <p className="mt-1 text-[12px] text-muted-foreground">Status · {statusLabel}</p>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

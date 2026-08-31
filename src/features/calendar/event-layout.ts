import type { AppointmentRow } from "@/features/calendar/contracts";
import { minutesInTimeZone } from "@/features/calendar/display";

export const AGENDA_DAY_START_HOUR = 7;
export const AGENDA_DAY_END_HOUR = 21;
export const AGENDA_HOUR_HEIGHT_PX = 48;
export const AGENDA_EVENT_MIN_HEIGHT_PX = 18;

export interface TimedEventLayout {
  appointment: AppointmentRow;
  startMin: number;
  endMin: number;
  column: number;
  columns: number;
}

interface TimedItem {
  appointment: AppointmentRow;
  startMin: number;
  endMin: number;
}

export function agendaHourRange(
  appointments: Pick<AppointmentRow, "starts_at" | "ends_at">[],
  timeZone: string,
  startHour = AGENDA_DAY_START_HOUR,
  endHour = AGENDA_DAY_END_HOUR,
): { startHour: number; endHour: number } {
  let start = startHour;
  let end = endHour;
  for (const appointment of appointments) {
    const startMinutes = minutesInTimeZone(appointment.starts_at, timeZone);
    const endMinutes = minutesInTimeZone(appointment.ends_at, timeZone);
    start = Math.min(start, Math.floor(startMinutes / 60));
    end = Math.max(end, Math.ceil(Math.max(endMinutes, startMinutes + 15) / 60));
  }
  return {
    startHour: Math.max(0, start),
    endHour: Math.min(24, Math.max(end, start + 1)),
  };
}

/**
 * Pack overlapping events into side-by-side columns (Google Calendar-style).
 * Connected overlapping clusters share the same column count.
 */
export function layoutTimedEvents(
  appointments: AppointmentRow[],
  timeZone: string,
): TimedEventLayout[] {
  const items: TimedItem[] = appointments
    .map((appointment) => {
      const startMin = minutesInTimeZone(appointment.starts_at, timeZone);
      const rawEnd = minutesInTimeZone(appointment.ends_at, timeZone);
      return {
        appointment,
        startMin,
        endMin: Math.max(rawEnd, startMin + 15),
      };
    })
    .sort((left, right) => {
      if (left.startMin !== right.startMin) return left.startMin - right.startMin;
      if (left.endMin !== right.endMin) return left.endMin - right.endMin;
      return left.appointment.id.localeCompare(right.appointment.id);
    });

  const result: TimedEventLayout[] = [];
  for (const cluster of clusterOverlapping(items)) {
    const columnsEnd: number[] = [];
    const placed: TimedEventLayout[] = cluster.map((item) => {
      let column = columnsEnd.findIndex((end) => end <= item.startMin);
      if (column === -1) {
        column = columnsEnd.length;
        columnsEnd.push(item.endMin);
      } else {
        columnsEnd[column] = item.endMin;
      }
      return { ...item, column, columns: 0 };
    });
    const columns = Math.max(1, columnsEnd.length);
    for (const item of placed) {
      result.push({ ...item, columns });
    }
  }
  return result;
}

function clusterOverlapping(items: TimedItem[]): TimedItem[][] {
  const clusters: TimedItem[][] = [];
  let current: TimedItem[] = [];
  let currentEnd = Number.NEGATIVE_INFINITY;
  for (const item of items) {
    if (current.length === 0 || item.startMin < currentEnd) {
      current.push(item);
      currentEnd = Math.max(currentEnd, item.endMin);
    } else {
      clusters.push(current);
      current = [item];
      currentEnd = item.endMin;
    }
  }
  if (current.length > 0) {
    clusters.push(current);
  }
  return clusters;
}

export function timedEventPosition(
  layout: TimedEventLayout,
  startHour: number,
  hourHeightPx = AGENDA_HOUR_HEIGHT_PX,
): { top: number; height: number; left: string; width: string } {
  const dayStartMin = startHour * 60;
  const top = ((layout.startMin - dayStartMin) / 60) * hourHeightPx;
  const height = Math.max(
    AGENDA_EVENT_MIN_HEIGHT_PX,
    ((layout.endMin - layout.startMin) / 60) * hourHeightPx,
  );
  const gutter = 1;
  const leftPct = (layout.column / layout.columns) * 100;
  const widthPct = 100 / layout.columns;
  return {
    top,
    height,
    left: `calc(${leftPct}% + ${gutter}px)`,
    width: `calc(${widthPct}% - ${gutter * 2}px)`,
  };
}

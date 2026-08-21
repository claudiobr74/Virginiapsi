import { zonedTimeToUtcIso } from "@/lib/utils/timezone";

export type AgendaView = "day" | "week" | "month";

const FALLBACK_TIME_ZONE = "America/Sao_Paulo";

export function resolveTimeZone(timeZone: string | undefined): string {
  const candidate = timeZone?.trim() || FALLBACK_TIME_ZONE;
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: candidate }).format(new Date());
    return candidate;
  } catch {
    return FALLBACK_TIME_ZONE;
  }
}

function addDays(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function startOfWeek(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekday = date.getUTCDay(); // 0 = Sunday
  const diffToMonday = weekday === 0 ? -6 : 1 - weekday;
  date.setUTCDate(date.getUTCDate() + diffToMonday);
  return date.toISOString().slice(0, 10);
}

function startOfMonth(dateStr: string): string {
  const [year, month] = dateStr.split("-").map(Number);
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

function addMonths(dateStr: string, months: number): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + months, day));
  return date.toISOString().slice(0, 10);
}

export interface AgendaWindow {
  fromIso: string;
  toIso: string;
  /** Civil dates (YYYY-MM-DD) covered by the window, for grouping/rendering. */
  days: string[];
}

export function computeAgendaWindow(
  view: AgendaView,
  referenceDate: string,
  timeZone: string,
): AgendaWindow {
  const zone = resolveTimeZone(timeZone);
  if (view === "day") {
    const nextDay = addDays(referenceDate, 1);
    return {
      fromIso: zonedTimeToUtcIso(referenceDate, "00:00", zone),
      toIso: zonedTimeToUtcIso(nextDay, "00:00", zone),
      days: [referenceDate],
    };
  }

  if (view === "week") {
    const start = startOfWeek(referenceDate);
    const days = Array.from({ length: 7 }, (_, index) => addDays(start, index));
    return {
      fromIso: zonedTimeToUtcIso(start, "00:00", zone),
      toIso: zonedTimeToUtcIso(addDays(start, 7), "00:00", zone),
      days,
    };
  }

  const monthStart = startOfMonth(referenceDate);
  const nextMonthStart = addMonths(monthStart, 1);
  const dayCount =
    (Date.parse(`${nextMonthStart}T00:00:00Z`) - Date.parse(`${monthStart}T00:00:00Z`)) /
    (24 * 60 * 60 * 1000);
  const days = Array.from({ length: dayCount }, (_, index) => addDays(monthStart, index));

  return {
    fromIso: zonedTimeToUtcIso(monthStart, "00:00", zone),
    toIso: zonedTimeToUtcIso(nextMonthStart, "00:00", zone),
    days,
  };
}

export function shiftReferenceDate(
  view: AgendaView,
  referenceDate: string,
  direction: 1 | -1,
): string {
  if (view === "day") {
    return addDays(referenceDate, direction);
  }
  if (view === "week") {
    return addDays(referenceDate, 7 * direction);
  }
  return addMonths(referenceDate, direction);
}

export function todayInTimeZone(timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: resolveTimeZone(timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

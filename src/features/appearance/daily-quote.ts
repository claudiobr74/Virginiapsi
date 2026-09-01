import {
  PSYCHOLOGY_QUOTE_COUNT,
  PSYCHOLOGY_QUOTES,
  type QuoteMode,
} from "@/features/appearance/psychology-quotes";
import { resolveTimeZone } from "@/features/calendar/date-window";
import { civilDateInTimeZone, zonedTimeToUtcIso } from "@/lib/utils/timezone";

function addOneCivilDay(civilDate: string): string {
  const [year, month, day] = civilDate.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return next.toISOString().slice(0, 10);
}

/** Days since Unix epoch for a civil YYYY-MM-DD (timezone-independent). */
export function civilDateOrdinal(civilDate: string): number {
  const [year, month, day] = civilDate.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

export function dailyQuoteIndex(civilDate: string): number {
  const ordinal = civilDateOrdinal(civilDate);
  return ((ordinal % PSYCHOLOGY_QUOTE_COUNT) + PSYCHOLOGY_QUOTE_COUNT) % PSYCHOLOGY_QUOTE_COUNT;
}

export function getDailyPsychologyQuote(
  timeZone: string,
  now: Date = new Date(),
): string {
  const zone = resolveTimeZone(timeZone);
  const civil = civilDateInTimeZone(now.toISOString(), zone);
  return PSYCHOLOGY_QUOTES[dailyQuoteIndex(civil)];
}

export function quoteCivilDate(timeZone: string, now: Date = new Date()): string {
  return civilDateInTimeZone(now.toISOString(), resolveTimeZone(timeZone));
}

export function nextLocalMidnightMs(
  timeZone: string,
  now: Date = new Date(),
): number {
  const zone = resolveTimeZone(timeZone);
  const civil = civilDateInTimeZone(now.toISOString(), zone);
  const tomorrow = addOneCivilDay(civil);
  return Date.parse(zonedTimeToUtcIso(tomorrow, "00:00", zone));
}

/** True when the client already crossed local midnight relative to the SSR civil date. */
export function clientIsOnLaterCivilDate(
  serverCivilDate: string,
  timeZone: string,
  now: Date = new Date(),
): boolean {
  return quoteCivilDate(timeZone, now) > serverCivilDate;
}

export function resolvePsychologyQuote(input: {
  mode?: QuoteMode | string | null;
  customQuote?: string | null;
  timeZone: string;
  now?: Date;
}): string | null {
  const mode: QuoteMode = input.mode === "custom" ? "custom" : "daily";
  if (mode === "custom") {
    const text = input.customQuote?.trim() ?? "";
    return text || null;
  }
  return getDailyPsychologyQuote(input.timeZone, input.now);
}

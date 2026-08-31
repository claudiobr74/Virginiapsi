/**
 * Converts a wall-clock date+time in a given IANA timezone into a UTC ISO
 * string, without pulling in a date library. Used whenever a user picks a
 * date/time in the organization's timezone (docs/03-architecture.md:
 * "banco em timestamptz... UI formata no timezone da organização").
 *
 * Implementation note: the offset is computed by formatting an
 * approximately-correct instant (the wall-clock values read as if they were
 * UTC) in the target timezone, then reading back the offset implied by that
 * formatting. This is correct for the vast majority of zones/instants and
 * exactly correct for timezones without DST (e.g. America/Sao_Paulo, which
 * has observed no DST since 2019) — the only edge case is a date/time chosen
 * within a DST transition window in a zone that still observes DST, where
 * the result can be off by the transition's delta (usually 1h).
 */
export function zonedTimeToUtcIso(date: string, time: string, timeZone: string): string {
  const naiveUtcMs = Date.parse(`${date}T${time}:00.000Z`);
  if (Number.isNaN(naiveUtcMs)) {
    throw new Error(`invalid date/time: ${date} ${time}`);
  }

  const offsetMinutes = getTimeZoneOffsetMinutes(timeZone, new Date(naiveUtcMs));
  return new Date(naiveUtcMs - offsetMinutes * 60_000).toISOString();
}

function getTimeZoneOffsetMinutes(timeZone: string, at: Date): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const parts = Object.fromEntries(
    formatter.formatToParts(at).map((part) => [part.type, part.value]),
  );

  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );

  return (asUtc - at.getTime()) / 60_000;
}

export function formatInTimeZone(
  iso: string,
  timeZone: string,
  options: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" },
): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone, ...options }).format(new Date(iso));
}

function zonedPart(
  iso: string,
  timeZone: string,
  type: Intl.DateTimeFormatPartTypes,
  extra: Intl.DateTimeFormatOptions = {},
): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    ...extra,
  }).formatToParts(new Date(iso));
  return parts.find((part) => part.type === type)?.value ?? "";
}

/** Civil date (YYYY-MM-DD) of a UTC instant in the organization timezone. */
export function toOrganizationDate(iso: string, timeZone: string): string {
  const year = zonedPart(iso, timeZone, "year");
  const month = zonedPart(iso, timeZone, "month");
  const day = zonedPart(iso, timeZone, "day");
  return `${year}-${month}-${day}`;
}

/** Civil time (HH:mm) of a UTC instant in the organization timezone. */
export function toOrganizationTime(iso: string, timeZone: string): string {
  const hour = zonedPart(iso, timeZone, "hour").padStart(2, "0");
  const minute = zonedPart(iso, timeZone, "minute").padStart(2, "0");
  return `${hour}:${minute}`;
}

export function utcToOrganizationDateTime(
  iso: string,
  timeZone: string,
): { date: string; time: string } {
  return {
    date: toOrganizationDate(iso, timeZone),
    time: toOrganizationTime(iso, timeZone),
  };
}

export function localDateTimeToUtc(
  date: string,
  time: string,
  timeZone: string,
): string {
  return zonedTimeToUtcIso(date, time, timeZone);
}

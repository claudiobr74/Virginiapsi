import { utcToOrganizationDateTime, zonedTimeToUtcIso } from "@/lib/utils/timezone";

export interface GoogleEventTime {
  dateTime?: string;
  date?: string;
  timeZone?: string;
}

/**
 * Maps a Google event start/end to UTC ISO instants using the organization
 * timezone for all-day dates. Never uses UTC `slice()` of a timestamptz.
 */
export function googleEventWindowIso(
  event: { start?: GoogleEventTime; end?: GoogleEventTime },
  organizationTimeZone: string,
): { startIso: string; endIso: string } | null {
  const startIso = instantFromGoogleTime(event.start, organizationTimeZone);
  const endIso = instantFromGoogleTime(event.end, organizationTimeZone);
  if (!startIso || !endIso) {
    return null;
  }
  return { startIso, endIso };
}

function instantFromGoogleTime(
  value: GoogleEventTime | undefined,
  organizationTimeZone: string,
): string | null {
  if (value?.dateTime) {
    const parsed = new Date(value.dateTime);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  if (value?.date && /^\d{4}-\d{2}-\d{2}$/.test(value.date)) {
    return zonedTimeToUtcIso(value.date, "00:00", organizationTimeZone);
  }
  return null;
}

/**
 * Google Calendar wall-clock + explicit IANA timezone. Never send a UTC
 * timestamptz and expect the UI clock to infer America/Sao_Paulo.
 */
export function googleEventDateTimePayload(
  utcIso: string,
  organizationTimeZone: string,
): { dateTime: string; timeZone: string } {
  const local = utcToOrganizationDateTime(utcIso, organizationTimeZone);
  return {
    dateTime: `${local.date}T${local.time}:00`,
    timeZone: organizationTimeZone,
  };
}

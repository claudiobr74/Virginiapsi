import { GoogleApiError, type GoogleCalendarClient } from "@/lib/integrations/google/calendar-client";

export function googleEventWriteBody(input: {
  summary: string;
  startsAt: string;
  endsAt: string;
}): Record<string, unknown> {
  return {
    summary: input.summary,
    start: { dateTime: input.startsAt },
    end: { dateTime: input.endsAt },
  };
}

export async function deleteGoogleEventIgnoring404(
  client: GoogleCalendarClient,
  calendarId: string,
  eventId: string,
): Promise<{ missing: boolean }> {
  try {
    await client.deleteEvent(calendarId, eventId);
    return { missing: false };
  } catch (error) {
    if (error instanceof GoogleApiError && error.status === 404) {
      return { missing: true };
    }
    throw error;
  }
}

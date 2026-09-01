import type { AppointmentStatus } from "@/features/calendar/contracts";
import {
  deriveImportedAppointmentStatus,
  persistedGoogleEventType,
} from "@/features/calendar/google-event-status";
import type { GoogleCalendarEvent } from "@/lib/integrations/google/calendar-client";

export function eventWindowIso(event: {
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
}): { startIso: string; endIso: string } | null {
  const startIso =
    event.start?.dateTime ??
    (event.start?.date ? `${event.start.date}T00:00:00.000Z` : null);
  const endIso =
    event.end?.dateTime ??
    (event.end?.date ? `${event.end.date}T00:00:00.000Z` : null);
  if (!startIso || !endIso) {
    return null;
  }
  return { startIso, endIso };
}

export function isGoogleSourceDeleted(event: { status?: string }): boolean {
  return event.status === "cancelled";
}

export type GooglePullEventDecision =
  | { action: "mark_deleted"; googleEventId: string }
  | { action: "skip_no_window"; googleEventId: string }
  | {
      action: "upsert";
      googleEventId: string;
      googleEtag: string | null;
      startIso: string;
      endIso: string;
      summary: string;
      status: AppointmentStatus;
      googleColorId: string | null;
      googleEventType: string | null;
    };

export function decideGooglePullEvent(
  event: GoogleCalendarEvent,
): GooglePullEventDecision {
  if (isGoogleSourceDeleted(event)) {
    return { action: "mark_deleted", googleEventId: event.id };
  }

  const window = eventWindowIso(event);
  if (!window) {
    return { action: "skip_no_window", googleEventId: event.id };
  }

  return {
    action: "upsert",
    googleEventId: event.id,
    googleEtag: event.etag ?? null,
    startIso: window.startIso,
    endIso: window.endIso,
    summary: event.summary ?? "Evento do Google",
    status: deriveImportedAppointmentStatus(event),
    googleColorId: event.colorId ?? null,
    googleEventType: persistedGoogleEventType(event.eventType),
  };
}

export function googleEventIdsMissingFromSnapshot(
  localActiveGoogleEventIds: readonly string[],
  seenActiveGoogleEventIds: ReadonlySet<string>,
): string[] {
  return localActiveGoogleEventIds.filter(
    (eventId) => eventId.length > 0 && !seenActiveGoogleEventIds.has(eventId),
  );
}

export interface GoogleCalendarPullPage {
  items: GoogleCalendarEvent[];
  nextPageToken?: string;
}

export interface GoogleCalendarPullPorts {
  listEvents: (pageToken?: string) => Promise<GoogleCalendarPullPage>;
  upsertExternal: (decision: Extract<GooglePullEventDecision, { action: "upsert" }>) => Promise<void>;
  markDeleted: (googleEventId: string) => Promise<void>;
  reconcileUnseen: (seenActiveGoogleEventIds: string[]) => Promise<number>;
}

export interface GoogleCalendarPullResult {
  syncedCount: number;
  seenActiveGoogleEventIds: string[];
  reconciledUnseenCount: number;
  completed: true;
}

/**
 * Pulls every Google page first. Snapshot cleanup runs only after the last
 * page succeeds. A thrown list/upsert/mark error skips reconcileUnseen.
 */
export async function runGoogleCalendarPull(
  ports: GoogleCalendarPullPorts,
): Promise<GoogleCalendarPullResult> {
  const seenActiveGoogleEventIds = new Set<string>();
  let syncedCount = 0;
  let pageToken: string | undefined;

  do {
    const page = await ports.listEvents(pageToken);
    for (const event of page.items) {
      const decision = decideGooglePullEvent(event);
      if (decision.action === "mark_deleted") {
        await ports.markDeleted(decision.googleEventId);
        continue;
      }
      if (decision.action === "skip_no_window") {
        continue;
      }
      seenActiveGoogleEventIds.add(decision.googleEventId);
      await ports.upsertExternal(decision);
      syncedCount += 1;
    }
    pageToken = page.nextPageToken;
  } while (pageToken);

  const seen = [...seenActiveGoogleEventIds];
  const reconciledUnseenCount = await ports.reconcileUnseen(seen);
  return {
    syncedCount,
    seenActiveGoogleEventIds: seen,
    reconciledUnseenCount,
    completed: true,
  };
}

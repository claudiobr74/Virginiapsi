import { randomUUID } from "node:crypto";
import type {
  GoogleCalendarClient,
  GoogleCalendarEvent,
} from "@/lib/integrations/google/calendar-client";

export type MeetOutcomeStatus = "pending" | "success" | "failure";
export type ExistingMeetStatus = "none" | MeetOutcomeStatus;

export interface MeetOutcome {
  status: MeetOutcomeStatus;
  requestId: string;
  meetUrl: string | null;
  event: GoogleCalendarEvent;
}

export interface ExistingMeetState {
  status: ExistingMeetStatus;
  requestId: string | null;
  meetUrl: string | null;
}

/**
 * Builds the `conferenceData.createRequest` block per
 * docs/06-integrations.md §1: a brand-new requestId every time, Meet
 * (`hangoutsMeet`) as the only solution. Callers must never reuse a
 * requestId across attempts — a fresh one is generated internally.
 */
export function buildConferenceCreateRequest() {
  return {
    conferenceData: {
      createRequest: {
        requestId: randomUUID(),
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    },
  };
}

function extractMeetUrl(event: GoogleCalendarEvent): string | null {
  const entryPoint = event.conferenceData?.entryPoints?.find(
    (point) => point.entryPointType === "video",
  );
  return entryPoint?.uri ?? event.hangoutLink ?? null;
}

/**
 * Inspects the Google event before any new createRequest is issued. This is
 * the idempotency/recovery boundary used by the UI hotfix: if Google already
 * has a real conference, reuse it; if creation is still pending, wait/recheck
 * instead of requesting a second room.
 */
export function inspectExistingMeet(event: GoogleCalendarEvent): ExistingMeetState {
  const request = event.conferenceData?.createRequest;
  const meetUrl = extractMeetUrl(event);

  if (meetUrl) {
    return {
      status: "success",
      requestId: request?.requestId ?? null,
      meetUrl,
    };
  }

  if (!request) {
    return { status: "none", requestId: null, meetUrl: null };
  }

  if (request.status?.statusCode === "failure") {
    return { status: "failure", requestId: request.requestId, meetUrl: null };
  }

  return { status: "pending", requestId: request.requestId, meetUrl: null };
}

function toOutcome(event: GoogleCalendarEvent, requestId: string): MeetOutcome {
  const existing = inspectExistingMeet(event);

  if (existing.status === "success") {
    return {
      status: "success",
      requestId,
      meetUrl: existing.meetUrl,
      event,
    };
  }

  if (existing.status === "failure") {
    return { status: "failure", requestId, meetUrl: null, event };
  }

  return { status: "pending", requestId, meetUrl: null, event };
}

export interface CreateMeetOptions {
  calendarId: string;
  eventId: string;
  client: GoogleCalendarClient;
  /** Bounded re-fetch while the creation is still pending. */
  maxAttempts?: number;
  /** Injectable for tests — must not be a real sleep in unit tests. */
  wait?: (attempt: number) => Promise<void>;
}

const defaultWait = (attempt: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, Math.min(500 * attempt, 2000)));

/**
 * Requests a Meet link for an existing event via `conferenceData.createRequest`
 * (a brand-new requestId is generated here), then re-fetches with bounded
 * backoff while the creation is `pending`. The URL is persisted by the
 * caller only when this resolves to `success` — `pending`/`failure` never
 * produce a URL, fabricated or otherwise.
 */
export async function requestMeetForEvent(
  options: CreateMeetOptions,
): Promise<MeetOutcome> {
  const { calendarId, eventId, client, maxAttempts = 3, wait = defaultWait } = options;
  const conferenceRequest = buildConferenceCreateRequest();
  const requestId = conferenceRequest.conferenceData.createRequest.requestId;

  let event = await client.patchEvent(calendarId, eventId, conferenceRequest, {
    conferenceDataVersion: 1,
  });

  let outcome = toOutcome(event, requestId);

  let attempt = 0;
  while (outcome.status === "pending" && attempt < maxAttempts) {
    await wait(attempt + 1);
    event = await client.getEvent(calendarId, eventId);
    outcome = toOutcome(event, requestId);
    attempt += 1;
  }

  return outcome;
}

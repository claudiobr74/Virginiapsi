// Thin REST adapter over the Google Calendar API v3. Deliberately not using
// the `googleapis` SDK: a plain `fetch`-based client is small, has zero
// extra dependencies, and — most importantly for this project's test
// strategy (docs/07-test-strategy.md: "adapters com HTTP mocks estritos") —
// is trivial to unit test by injecting a mock `fetch`.
//
// Never called directly from a route handler with hardcoded fetch: always go
// through this class so request/response shapes stay in one place.

const CALENDAR_API_BASE = "https://www.googleapis.com/calendar/v3";

export interface GoogleCalendarListEntry {
  id: string;
  summary: string;
  primary?: boolean;
  accessRole?: string;
}

export interface ConferenceCreateRequestStatus {
  statusCode: "pending" | "success" | "failure";
}

export interface ConferenceData {
  createRequest?: {
    requestId: string;
    status?: ConferenceCreateRequestStatus;
    conferenceSolutionKey?: { type: string };
  };
  entryPoints?: Array<{ entryPointType: string; uri: string }>;
  conferenceId?: string;
}

export interface GoogleCalendarEvent {
  id: string;
  etag?: string;
  status?: string;
  summary?: string;
  start?: { dateTime?: string; date?: string; timeZone?: string };
  end?: { dateTime?: string; date?: string; timeZone?: string };
  conferenceData?: ConferenceData;
  htmlLink?: string;
}

export interface GoogleCalendarEventList {
  items: GoogleCalendarEvent[];
  nextPageToken?: string;
  nextSyncToken?: string;
}

export class GoogleApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = "GoogleApiError";
  }
}

export interface GoogleCalendarClientOptions {
  accessToken: string;
  fetchImpl?: typeof fetch;
}

export class GoogleCalendarClient {
  private readonly accessToken: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: GoogleCalendarClientOptions) {
    this.accessToken = options.accessToken;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private async request<T>(
    path: string,
    init: RequestInit & { query?: Record<string, string | number | boolean | undefined> } = {},
  ): Promise<T> {
    const { query, ...rest } = init;
    const url = new URL(`${CALENDAR_API_BASE}${path}`);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }

    let response: Response;
    try {
      response = await this.fetchImpl(url.toString(), {
        ...rest,
        signal: rest.signal ?? AbortSignal.timeout(10_000),
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          ...(rest.body ? { "Content-Type": "application/json" } : {}),
          ...rest.headers,
        },
      });
    } catch (error) {
      if (
        error instanceof Error &&
        (error.name === "TimeoutError" || error.name === "AbortError")
      ) {
        throw new GoogleApiError("Google Calendar API request timed out", 504);
      }
      throw error;
    }

    if (!response.ok) {
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        body = undefined;
      }
      throw new GoogleApiError(
        `Google Calendar API request failed: ${response.status}`,
        response.status,
        body,
      );
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }

  async listCalendars(): Promise<GoogleCalendarListEntry[]> {
    const result = await this.request<{ items: GoogleCalendarListEntry[] }>(
      "/users/me/calendarList",
    );
    return result.items ?? [];
  }

  async listEvents(
    calendarId: string,
    options: {
      timeMin: string;
      timeMax: string;
      pageToken?: string;
      showDeleted?: boolean;
    } = {
      timeMin: "",
      timeMax: "",
    },
  ): Promise<GoogleCalendarEventList> {
    return this.request<GoogleCalendarEventList>(
      `/calendars/${encodeURIComponent(calendarId)}/events`,
      {
        query: {
          timeMin: options.timeMin,
          timeMax: options.timeMax,
          pageToken: options.pageToken,
          singleEvents: true,
          // showDeleted is incompatible with orderBy=startTime.
          orderBy: options.showDeleted ? undefined : "startTime",
          showDeleted: options.showDeleted ? true : undefined,
        },
      },
    );
  }

  async getEvent(calendarId: string, eventId: string): Promise<GoogleCalendarEvent> {
    return this.request<GoogleCalendarEvent>(
      `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    );
  }

  async insertEvent(
    calendarId: string,
    body: Record<string, unknown>,
    options: { conferenceDataVersion?: 0 | 1 } = {},
  ): Promise<GoogleCalendarEvent> {
    return this.request<GoogleCalendarEvent>(
      `/calendars/${encodeURIComponent(calendarId)}/events`,
      {
        method: "POST",
        body: JSON.stringify(body),
        query: { conferenceDataVersion: options.conferenceDataVersion },
      },
    );
  }

  async patchEvent(
    calendarId: string,
    eventId: string,
    body: Record<string, unknown>,
    options: { conferenceDataVersion?: 0 | 1 } = {},
  ): Promise<GoogleCalendarEvent> {
    return this.request<GoogleCalendarEvent>(
      `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      {
        method: "PATCH",
        body: JSON.stringify(body),
        query: { conferenceDataVersion: options.conferenceDataVersion },
      },
    );
  }

  async deleteEvent(calendarId: string, eventId: string): Promise<void> {
    await this.request<void>(
      `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      { method: "DELETE" },
    );
  }
}

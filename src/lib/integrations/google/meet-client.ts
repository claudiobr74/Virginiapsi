const MEET_API_BASE = "https://meet.googleapis.com/v2";

export interface GoogleMeetSpace {
  name: string;
  meetingUri: string;
  meetingCode: string;
}

export interface GoogleMeetConferenceRecord {
  name: string;
  startTime: string;
  endTime?: string;
  expireTime?: string;
  space: string;
}

export type GoogleMeetTranscriptState =
  | "STATE_UNSPECIFIED"
  | "STARTED"
  | "ENDED"
  | "FILE_GENERATED";

export interface GoogleMeetTranscript {
  name: string;
  state: GoogleMeetTranscriptState;
  startTime?: string;
  endTime?: string;
}

export interface GoogleMeetTranscriptEntry {
  name: string;
  participant?: string;
  text: string;
  languageCode?: string;
  startTime: string;
  endTime: string;
}

interface ConferenceRecordsListResponse {
  conferenceRecords?: GoogleMeetConferenceRecord[];
  nextPageToken?: string;
}

interface TranscriptsListResponse {
  transcripts?: GoogleMeetTranscript[];
  nextPageToken?: string;
}

interface TranscriptEntriesListResponse {
  transcriptEntries?: GoogleMeetTranscriptEntry[];
  nextPageToken?: string;
}

function googleApiErrorMessage(body: unknown): string | undefined {
  if (!body || typeof body !== "object") {
    return undefined;
  }

  const googleError = (body as { error?: unknown }).error;
  if (!googleError || typeof googleError !== "object") {
    return undefined;
  }

  const message = (googleError as { message?: unknown }).message;
  if (typeof message !== "string" || !message.trim()) {
    return undefined;
  }

  return message.trim().slice(0, 600);
}

export class GoogleMeetApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = "GoogleMeetApiError";
  }
}

export class GoogleMeetClient {
  private readonly accessToken: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: { accessToken: string; fetchImpl?: typeof fetch }) {
    this.accessToken = options.accessToken;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private async request<T>(
    path: string,
    init: RequestInit = {},
    query?: Record<string, string | number | undefined>,
  ): Promise<T> {
    const url = new URL(`${MEET_API_BASE}${path}`);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }

    let response: Response;
    try {
      response = await this.fetchImpl(url.toString(), {
        ...init,
        signal: init.signal ?? AbortSignal.timeout(10_000),
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          ...(init.body ? { "Content-Type": "application/json" } : {}),
          ...init.headers,
        },
      });
    } catch (error) {
      if (
        error instanceof Error &&
        (error.name === "TimeoutError" || error.name === "AbortError")
      ) {
        throw new GoogleMeetApiError("Google Meet API request timed out", 504);
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

      const googleMessage = googleApiErrorMessage(body);
      throw new GoogleMeetApiError(
        googleMessage
          ? `Google Meet API request failed: ${response.status} — ${googleMessage}`
          : `Google Meet API request failed: ${response.status}`,
        response.status,
        body,
      );
    }

    return (await response.json()) as T;
  }

  async createSpace(options: { autoTranscription?: boolean } = {}): Promise<GoogleMeetSpace> {
    const body = options.autoTranscription
      ? {
          config: {
            artifactConfig: {
              transcriptionConfig: {
                autoTranscriptionGeneration: "ON",
              },
            },
          },
        }
      : {};

    const space = await this.request<GoogleMeetSpace>("/spaces", {
      method: "POST",
      body: JSON.stringify(body),
    });

    if (!space.name || !space.meetingUri || !space.meetingCode) {
      throw new GoogleMeetApiError("Google Meet API returned an incomplete space", 502, space);
    }

    return space;
  }

  async getSpace(nameOrMeetingCode: string): Promise<GoogleMeetSpace> {
    const resource = nameOrMeetingCode.startsWith("spaces/")
      ? nameOrMeetingCode.slice("spaces/".length)
      : nameOrMeetingCode;
    return this.request<GoogleMeetSpace>(`/spaces/${encodeURIComponent(resource)}`);
  }

  async listConferenceRecordsForSpace(spaceName: string): Promise<GoogleMeetConferenceRecord[]> {
    const records: GoogleMeetConferenceRecord[] = [];
    let pageToken: string | undefined;

    do {
      const response = await this.request<ConferenceRecordsListResponse>(
        "/conferenceRecords",
        {},
        {
          pageSize: 100,
          pageToken,
          filter: `space.name = "${spaceName}"`,
        },
      );
      records.push(...(response.conferenceRecords ?? []));
      pageToken = response.nextPageToken;
    } while (pageToken);

    return records;
  }

  async listTranscripts(conferenceRecordName: string): Promise<GoogleMeetTranscript[]> {
    const transcripts: GoogleMeetTranscript[] = [];
    let pageToken: string | undefined;

    do {
      const response = await this.request<TranscriptsListResponse>(
        `/${conferenceRecordName}/transcripts`,
        {},
        { pageSize: 100, pageToken },
      );
      transcripts.push(...(response.transcripts ?? []));
      pageToken = response.nextPageToken;
    } while (pageToken);

    return transcripts;
  }

  async listTranscriptEntries(transcriptName: string): Promise<GoogleMeetTranscriptEntry[]> {
    const entries: GoogleMeetTranscriptEntry[] = [];
    let pageToken: string | undefined;

    do {
      const response = await this.request<TranscriptEntriesListResponse>(
        `/${transcriptName}/entries`,
        {},
        { pageSize: 100, pageToken },
      );
      entries.push(...(response.transcriptEntries ?? []));
      pageToken = response.nextPageToken;
    } while (pageToken);

    return entries;
  }
}

const MEET_API_BASE = "https://meet.googleapis.com/v2";

export interface GoogleMeetSpace {
  name: string;
  meetingUri: string;
  meetingCode: string;
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

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${MEET_API_BASE}${path}`, {
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
      throw new GoogleMeetApiError(
        `Google Meet API request failed: ${response.status}`,
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
}

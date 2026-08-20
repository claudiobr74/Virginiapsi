import { describe, expect, it, vi } from "vitest";
import type {
  GoogleCalendarClient,
  GoogleCalendarEvent,
} from "@/lib/integrations/google/calendar-client";
import {
  buildConferenceCreateRequest,
  requestMeetForEvent,
} from "@/lib/integrations/google/meet";

function fakeClient(overrides: Partial<GoogleCalendarClient> = {}) {
  return {
    patchEvent: vi.fn(),
    getEvent: vi.fn(),
    ...overrides,
  } as unknown as GoogleCalendarClient;
}

const noWait = async () => {};

describe("buildConferenceCreateRequest", () => {
  it("usa hangoutsMeet e gera um requestId novo a cada chamada", () => {
    const first = buildConferenceCreateRequest();
    const second = buildConferenceCreateRequest();

    expect(first.conferenceData.createRequest.conferenceSolutionKey.type).toBe(
      "hangoutsMeet",
    );
    expect(first.conferenceData.createRequest.requestId).not.toBe(
      second.conferenceData.createRequest.requestId,
    );
  });
});

describe("requestMeetForEvent", () => {
  it("patcheia o evento com conferenceDataVersion=1 e resolve 'success' com a URL real", async () => {
    const successEvent: GoogleCalendarEvent = {
      id: "evt-1",
      conferenceData: {
        createRequest: { requestId: "req-1", status: { statusCode: "success" } },
        entryPoints: [{ entryPointType: "video", uri: "https://meet.google.com/abc-defg-hij" }],
      },
    };

    const client = fakeClient({
      patchEvent: vi.fn().mockResolvedValue(successEvent),
    });

    const outcome = await requestMeetForEvent({
      calendarId: "primary",
      eventId: "evt-1",
      client,
      wait: noWait,
    });

    expect(outcome.status).toBe("success");
    expect(outcome.meetUrl).toBe("https://meet.google.com/abc-defg-hij");

    const [, , body, options] = (client.patchEvent as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(body.conferenceData.createRequest.conferenceSolutionKey.type).toBe(
      "hangoutsMeet",
    );
    expect(options).toEqual({ conferenceDataVersion: 1 });
  });

  it("reconsulta com backoff limitado enquanto 'pending', depois resolve 'success'", async () => {
    const pendingEvent: GoogleCalendarEvent = {
      id: "evt-1",
      conferenceData: {
        createRequest: { requestId: "req-1", status: { statusCode: "pending" } },
      },
    };
    const successEvent: GoogleCalendarEvent = {
      id: "evt-1",
      conferenceData: {
        createRequest: { requestId: "req-1", status: { statusCode: "success" } },
        entryPoints: [{ entryPointType: "video", uri: "https://meet.google.com/xyz-uvwx-rst" }],
      },
    };

    const getEvent = vi
      .fn()
      .mockResolvedValueOnce(pendingEvent)
      .mockResolvedValueOnce(successEvent);

    const client = fakeClient({
      patchEvent: vi.fn().mockResolvedValue(pendingEvent),
      getEvent,
    });

    const outcome = await requestMeetForEvent({
      calendarId: "primary",
      eventId: "evt-1",
      client,
      wait: noWait,
      maxAttempts: 5,
    });

    expect(outcome.status).toBe("success");
    expect(getEvent).toHaveBeenCalledTimes(2);
  });

  it("nunca fabrica uma URL: 'pending' permanente sem entry point vira 'pending', não 'success'", async () => {
    const staleSuccessWithoutUrl: GoogleCalendarEvent = {
      id: "evt-1",
      conferenceData: {
        createRequest: { requestId: "req-1", status: { statusCode: "success" } },
        entryPoints: [],
      },
    };

    const client = fakeClient({
      patchEvent: vi.fn().mockResolvedValue(staleSuccessWithoutUrl),
      getEvent: vi.fn().mockResolvedValue(staleSuccessWithoutUrl),
    });

    const outcome = await requestMeetForEvent({
      calendarId: "primary",
      eventId: "evt-1",
      client,
      wait: noWait,
      maxAttempts: 2,
    });

    expect(outcome.status).toBe("pending");
    expect(outcome.meetUrl).toBeNull();
  });

  it("resolve 'failure' sem tentar novamente e sem produzir URL", async () => {
    const failureEvent: GoogleCalendarEvent = {
      id: "evt-1",
      conferenceData: {
        createRequest: { requestId: "req-1", status: { statusCode: "failure" } },
      },
    };

    const getEvent = vi.fn();
    const client = fakeClient({
      patchEvent: vi.fn().mockResolvedValue(failureEvent),
      getEvent,
    });

    const outcome = await requestMeetForEvent({
      calendarId: "primary",
      eventId: "evt-1",
      client,
      wait: noWait,
    });

    expect(outcome.status).toBe("failure");
    expect(outcome.meetUrl).toBeNull();
    expect(getEvent).not.toHaveBeenCalled();
  });

  it("uma nova tentativa após failure usa um requestId diferente do anterior", async () => {
    const failureEvent: GoogleCalendarEvent = {
      id: "evt-1",
      conferenceData: {
        createRequest: { requestId: "whatever", status: { statusCode: "failure" } },
      },
    };

    const patchEvent = vi.fn().mockResolvedValue(failureEvent);
    const client = fakeClient({ patchEvent, getEvent: vi.fn() });

    const first = await requestMeetForEvent({
      calendarId: "primary",
      eventId: "evt-1",
      client,
      wait: noWait,
    });
    const second = await requestMeetForEvent({
      calendarId: "primary",
      eventId: "evt-1",
      client,
      wait: noWait,
    });

    expect(first.requestId).not.toBe(second.requestId);
    const firstBody = patchEvent.mock.calls[0][2];
    const secondBody = patchEvent.mock.calls[1][2];
    expect(firstBody.conferenceData.createRequest.requestId).not.toBe(
      secondBody.conferenceData.createRequest.requestId,
    );
  });

  it("desiste após maxAttempts e retorna 'pending' sem URL", async () => {
    const pendingEvent: GoogleCalendarEvent = {
      id: "evt-1",
      conferenceData: {
        createRequest: { requestId: "req-1", status: { statusCode: "pending" } },
      },
    };

    const getEvent = vi.fn().mockResolvedValue(pendingEvent);
    const client = fakeClient({
      patchEvent: vi.fn().mockResolvedValue(pendingEvent),
      getEvent,
    });

    const outcome = await requestMeetForEvent({
      calendarId: "primary",
      eventId: "evt-1",
      client,
      wait: noWait,
      maxAttempts: 3,
    });

    expect(outcome.status).toBe("pending");
    expect(outcome.meetUrl).toBeNull();
    expect(getEvent).toHaveBeenCalledTimes(3);
  });
});

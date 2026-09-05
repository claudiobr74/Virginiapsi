import { describe, expect, it } from "vitest";
import {
  GoogleApiError,
  GoogleCalendarClient,
} from "@/lib/integrations/google/calendar-client";
import { mockFetch } from "./support/mock-fetch";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

describe("GoogleCalendarClient", () => {
  it("lista calendários com o Bearer token correto", async () => {
    const fetchImpl = mockFetch(async () =>
      jsonResponse({ items: [{ id: "primary", summary: "Consultório" }] }),
    );
    const client = new GoogleCalendarClient({ accessToken: "token-abc", fetchImpl });

    const calendars = await client.listCalendars();

    expect(calendars).toEqual([{ id: "primary", summary: "Consultório" }]);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(
      "https://www.googleapis.com/calendar/v3/users/me/calendarList",
    );
    expect((init?.headers as Record<string, string>).Authorization).toBe(
      "Bearer token-abc",
    );
  });

  it("lista eventos com timeMin/timeMax/singleEvents/orderBy", async () => {
    const fetchImpl = mockFetch(async () => jsonResponse({ items: [] }));
    const client = new GoogleCalendarClient({ accessToken: "token-abc", fetchImpl });

    await client.listEvents("primary", {
      timeMin: "2026-01-01T00:00:00.000Z",
      timeMax: "2026-01-31T00:00:00.000Z",
    });

    const [url] = fetchImpl.mock.calls[0];
    const parsed = new URL(url);
    expect(parsed.pathname).toBe("/calendar/v3/calendars/primary/events");
    expect(parsed.searchParams.get("timeMin")).toBe("2026-01-01T00:00:00.000Z");
    expect(parsed.searchParams.get("timeMax")).toBe("2026-01-31T00:00:00.000Z");
    expect(parsed.searchParams.get("singleEvents")).toBe("true");
    expect(parsed.searchParams.get("orderBy")).toBe("startTime");
  });

  it("listEvents preserva colorId devolvido pela API", async () => {
    const fetchImpl = mockFetch(async () =>
      jsonResponse({
        items: [
          {
            id: "evt-isadora",
            summary: "Isadora? não pode",
            status: "confirmed",
            colorId: "9",
            eventType: "default",
          },
        ],
      }),
    );
    const client = new GoogleCalendarClient({ accessToken: "token-abc", fetchImpl });
    const page = await client.listEvents("primary", {
      timeMin: "2026-09-01T00:00:00.000Z",
      timeMax: "2026-09-02T00:00:00.000Z",
    });
    expect(page.items[0]?.colorId).toBe("9");
    expect(page.items[0]?.eventType).toBe("default");
    expect(page.items[0]?.summary).toBe("Isadora? não pode");
  });

  it("listEvents com showDeleted não envia orderBy", async () => {
    const fetchImpl = mockFetch(async () => jsonResponse({ items: [] }));
    const client = new GoogleCalendarClient({ accessToken: "token-abc", fetchImpl });

    await client.listEvents("primary", {
      timeMin: "2026-01-01T00:00:00.000Z",
      timeMax: "2026-01-31T00:00:00.000Z",
      showDeleted: true,
    });

    const parsed = new URL(fetchImpl.mock.calls[0][0]);
    expect(parsed.searchParams.get("showDeleted")).toBe("true");
    expect(parsed.searchParams.get("orderBy")).toBeNull();
  });

  it("insertEvent envia conferenceDataVersion=1 quando solicitado", async () => {
    const fetchImpl = mockFetch(async () =>
      jsonResponse({ id: "evt-1", summary: "Consulta" }),
    );
    const client = new GoogleCalendarClient({ accessToken: "token-abc", fetchImpl });

    await client.insertEvent(
      "primary",
      { summary: "Consulta" },
      { conferenceDataVersion: 1 },
    );

    const [url, init] = fetchImpl.mock.calls[0];
    const parsed = new URL(url);
    expect(init?.method).toBe("POST");
    expect(parsed.searchParams.get("conferenceDataVersion")).toBe("1");
    expect(JSON.parse(init?.body as string)).toEqual({ summary: "Consulta" });
  });

  it("patchEvent usa PATCH no evento correto", async () => {
    const fetchImpl = mockFetch(async () => jsonResponse({ id: "evt-1" }));
    const client = new GoogleCalendarClient({ accessToken: "token-abc", fetchImpl });

    await client.patchEvent("primary", "evt-1", { summary: "Atualizado" });

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events/evt-1",
    );
    expect(init?.method).toBe("PATCH");
  });

  it("deleteEvent usa DELETE e não espera corpo", async () => {
    const fetchImpl = mockFetch(async () => new Response(null, { status: 204 }));
    const client = new GoogleCalendarClient({ accessToken: "token-abc", fetchImpl });

    await expect(client.deleteEvent("primary", "evt-1")).resolves.toBeUndefined();
    const [, init] = fetchImpl.mock.calls[0];
    expect(init?.method).toBe("DELETE");
  });

  it("lança GoogleApiError com status e corpo quando a API responde com erro", async () => {
    const fetchImpl = mockFetch(async () =>
      jsonResponse({ error: { message: "Not Found" } }, 404),
    );
    const client = new GoogleCalendarClient({ accessToken: "token-abc", fetchImpl });

    await expect(client.getEvent("primary", "missing")).rejects.toMatchObject({
      status: 404,
    });
    await expect(client.getEvent("primary", "missing")).rejects.toBeInstanceOf(
      GoogleApiError,
    );
  });

  it("codifica calendarId/eventId na URL (ex.: e-mail como calendarId)", async () => {
    const fetchImpl = mockFetch(async () => jsonResponse({ id: "evt-1" }));
    const client = new GoogleCalendarClient({ accessToken: "token-abc", fetchImpl });

    await client.getEvent("consultorio@example.com", "evt/with/slash");

    const [url] = fetchImpl.mock.calls[0];
    expect(url).toBe(
      "https://www.googleapis.com/calendar/v3/calendars/consultorio%40example.com/events/evt%2Fwith%2Fslash",
    );
  });

  it("getEvent preserva eventType devolvido pela API", async () => {
    const fetchImpl = mockFetch(async () =>
      jsonResponse({
        id: "evt-lucas",
        summary: "Lucas B+1(viajando)",
        status: "confirmed",
        colorId: "8",
        eventType: "outOfOffice",
      }),
    );
    const client = new GoogleCalendarClient({ accessToken: "token-abc", fetchImpl });
    const event = await client.getEvent("primary", "evt-lucas");
    expect(event.eventType).toBe("outOfOffice");
    expect(event.colorId).toBe("8");
    expect(event.summary).toBe("Lucas B+1(viajando)");
  });
});

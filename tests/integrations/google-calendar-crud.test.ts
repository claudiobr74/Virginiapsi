import { describe, expect, it } from "vitest";
import {
  deleteGoogleEventIgnoring404,
  googleEventWriteBody,
} from "@/features/calendar/google-write";
import {
  GoogleApiError,
  GoogleCalendarClient,
} from "@/lib/integrations/google/calendar-client";
import { mockFetch } from "./support/mock-fetch";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

describe("googleEventWriteBody", () => {
  it("envia summary, início e fim iguais nos dois lados", () => {
    expect(
      googleEventWriteBody({
        summary: "Ana Cláudia-1(c)",
        startsAt: "2026-09-02T12:00:00.000Z",
        endsAt: "2026-09-02T13:00:00.000Z",
      }),
    ).toEqual({
      summary: "Ana Cláudia-1(c)",
      start: { dateTime: "2026-09-02T12:00:00.000Z" },
      end: { dateTime: "2026-09-02T13:00:00.000Z" },
    });
  });
});

describe("CRUD Google Calendar via mock HTTP", () => {
  it("CREATE persiste google_event_id devolvido pelo insert", async () => {
    const fetchImpl = mockFetch(async () =>
      jsonResponse({
        id: "evt-created-1",
        etag: "etag-1",
        colorId: "11",
        summary: "Lucas B+1(viajando)",
        start: { dateTime: "2026-09-02T12:00:00.000Z" },
        end: { dateTime: "2026-09-02T13:00:00.000Z" },
      }),
    );
    const client = new GoogleCalendarClient({ accessToken: "token-abc", fetchImpl });
    const body = googleEventWriteBody({
      summary: "Lucas B+1(viajando)",
      startsAt: "2026-09-02T12:00:00.000Z",
      endsAt: "2026-09-02T13:00:00.000Z",
    });
    const created = await client.insertEvent("primary", body);
    expect(created.id).toBe("evt-created-1");
    expect(created.summary).toBe("Lucas B+1(viajando)");
    expect(JSON.parse(fetchImpl.mock.calls[0][1]?.body as string)).toEqual(body);
  });

  it("EDIT PATCH atualiza título, data e horário iguais nos dois lados", async () => {
    const fetchImpl = mockFetch(async () =>
      jsonResponse({
        id: "evt-a",
        summary: "Livia-1(c) / Flávia-3",
        start: { dateTime: "2026-09-03T15:00:00.000Z" },
        end: { dateTime: "2026-09-03T16:00:00.000Z" },
      }),
    );
    const client = new GoogleCalendarClient({ accessToken: "token-abc", fetchImpl });
    const body = googleEventWriteBody({
      summary: "Livia-1(c) / Flávia-3",
      startsAt: "2026-09-03T15:00:00.000Z",
      endsAt: "2026-09-03T16:00:00.000Z",
    });
    const patched = await client.patchEvent("primary", "evt-a", body);
    expect(patched.summary).toBe("Livia-1(c) / Flávia-3");
    expect(patched.start?.dateTime).toBe("2026-09-03T15:00:00.000Z");
    expect(patched.end?.dateTime).toBe("2026-09-03T16:00:00.000Z");
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toContain("/calendars/primary/events/evt-a");
    expect(init?.method).toBe("PATCH");
    expect(JSON.parse(init?.body as string)).toEqual(body);
  });

  it("DELETE remove o evento no Google", async () => {
    const fetchImpl = mockFetch(async () => new Response(null, { status: 204 }));
    const client = new GoogleCalendarClient({ accessToken: "token-abc", fetchImpl });
    const result = await deleteGoogleEventIgnoring404(client, "primary", "evt-a");
    expect(result.missing).toBe(false);
    expect(fetchImpl.mock.calls[0][1]?.method).toBe("DELETE");
  });

  it("DELETE 404 trata como exclusão concluída", async () => {
    const fetchImpl = mockFetch(async () =>
      jsonResponse({ error: { message: "Not Found" } }, 404),
    );
    const client = new GoogleCalendarClient({ accessToken: "token-abc", fetchImpl });
    await expect(deleteGoogleEventIgnoring404(client, "primary", "ghost")).resolves.toEqual({
      missing: true,
    });
  });

  it("DELETE 500 continua erro", async () => {
    const fetchImpl = mockFetch(async () =>
      jsonResponse({ error: { message: "boom" } }, 500),
    );
    const client = new GoogleCalendarClient({ accessToken: "token-abc", fetchImpl });
    await expect(deleteGoogleEventIgnoring404(client, "primary", "evt-a")).rejects.toBeInstanceOf(
      GoogleApiError,
    );
  });
});

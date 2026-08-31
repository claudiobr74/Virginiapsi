import { describe, expect, it } from "vitest";
import { googleEventDateTimePayload, googleEventWindowIso } from "@/lib/integrations/google/event-window";

describe("googleEventWindowIso", () => {
  it("converte dateTime com offset para UTC sem slice de string", () => {
    const window = googleEventWindowIso(
      {
        start: { dateTime: "2026-08-31T09:00:00-03:00", timeZone: "America/Sao_Paulo" },
        end: { dateTime: "2026-08-31T09:50:00-03:00", timeZone: "America/Sao_Paulo" },
      },
      "America/Sao_Paulo",
    );
    expect(window).toEqual({
      startIso: "2026-08-31T12:00:00.000Z",
      endIso: "2026-08-31T12:50:00.000Z",
    });
  });

  it("interpreta evento all-day no fuso da organização, não em UTC", () => {
    const window = googleEventWindowIso(
      {
        start: { date: "2026-08-31" },
        end: { date: "2026-09-01" },
      },
      "America/Sao_Paulo",
    );
    expect(window?.startIso).toBe("2026-08-31T03:00:00.000Z");
    expect(window?.endIso).toBe("2026-09-01T03:00:00.000Z");
  });
});

describe("googleEventDateTimePayload", () => {
  it("envia parede local 09:00 com timeZone America/Sao_Paulo a partir de 12:00Z", () => {
    expect(
      googleEventDateTimePayload("2026-08-31T12:00:00.000Z", "America/Sao_Paulo"),
    ).toEqual({
      dateTime: "2026-08-31T09:00:00",
      timeZone: "America/Sao_Paulo",
    });
  });

  it.each([
    ["00:30", "2026-08-31T03:30:00.000Z"],
    ["01:00", "2026-08-31T04:00:00.000Z"],
    ["08:00", "2026-08-31T11:00:00.000Z"],
    ["12:00", "2026-08-31T15:00:00.000Z"],
    ["23:30", "2026-09-01T02:30:00.000Z"],
  ] as const)("mantém %s no dia civil 2026-08-31", (time, utc) => {
    expect(googleEventDateTimePayload(utc, "America/Sao_Paulo")).toEqual({
      dateTime: `2026-08-31T${time}:00`,
      timeZone: "America/Sao_Paulo",
    });
  });
});

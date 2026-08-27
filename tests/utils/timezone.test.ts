import { describe, expect, it } from "vitest";
import { formatInTimeZone, zonedTimeToUtcIso, civilDateTimeInTimeZone, civilDateInTimeZone } from "@/lib/utils/timezone";

describe("zonedTimeToUtcIso", () => {
  it("converte horário de São Paulo (UTC-3, sem DST) para UTC", () => {
    const iso = zonedTimeToUtcIso("2026-03-10", "14:00", "America/Sao_Paulo");
    expect(iso).toBe("2026-03-10T17:00:00.000Z");
  });

  it("converte meia-noite corretamente cruzando o dia", () => {
    const iso = zonedTimeToUtcIso("2026-03-10", "23:00", "America/Sao_Paulo");
    expect(iso).toBe("2026-03-11T02:00:00.000Z");
  });

  it("UTC não sofre deslocamento", () => {
    const iso = zonedTimeToUtcIso("2026-03-10", "14:00", "UTC");
    expect(iso).toBe("2026-03-10T14:00:00.000Z");
  });
});

describe("formatInTimeZone", () => {
  it("formata um instante UTC no fuso da organização", () => {
    const formatted = formatInTimeZone(
      "2026-03-10T17:00:00.000Z",
      "America/Sao_Paulo",
    );
    expect(formatted).toBe("14:00");
  });
});

describe("civilDateTimeInTimeZone", () => {
  it("não fatia o prefixo ISO UTC — usa o dia civil da organização", () => {
    const civil = civilDateTimeInTimeZone(
      "2026-09-18T11:00:00+00:00",
      "America/Sao_Paulo",
    );
    expect(civil).toEqual({ date: "2026-09-18", time: "08:00" });
  });

  it("sessão noturna UTC permanece no dia civil anterior em São Paulo", () => {
    expect(civilDateInTimeZone("2026-03-11T02:00:00.000Z", "America/Sao_Paulo")).toBe(
      "2026-03-10",
    );
  });
});

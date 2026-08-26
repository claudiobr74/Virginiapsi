import { describe, expect, it } from "vitest";
import { formatInTimeZone, zonedTimeToUtcIso } from "@/lib/utils/timezone";

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

import { describe, expect, it } from "vitest";
import { formatInTimeZone, utcToOrganizationDateTime, zonedTimeToUtcIso } from "@/lib/utils/timezone";

describe("zonedTimeToUtcIso", () => {
  it("converte horário de São Paulo (UTC-3, sem DST) para UTC", () => {
    const iso = zonedTimeToUtcIso("2026-03-10", "14:00", "America/Sao_Paulo");
    expect(iso).toBe("2026-03-10T17:00:00.000Z");
  });

  it("converte meia-noite corretamente cruzando o dia", () => {
    const iso = zonedTimeToUtcIso("2026-03-10", "23:00", "America/Sao_Paulo");
    expect(iso).toBe("2026-03-11T02:00:00.000Z");
  });

  it("converte 09:00 em São Paulo no dia pedido para 12:00Z", () => {
    expect(zonedTimeToUtcIso("2026-08-31", "09:00", "America/Sao_Paulo")).toBe(
      "2026-08-31T12:00:00.000Z",
    );
  });

  it.each(["00:30", "01:00", "08:00", "12:00", "23:30"] as const)(
    "não desloca o dia civil de 2026-08-31 às %s em São Paulo",
    (time) => {
      const iso = zonedTimeToUtcIso("2026-08-31", time, "America/Sao_Paulo");
      const local = utcToOrganizationDateTime(iso, "America/Sao_Paulo");
      expect(local.date).toBe("2026-08-31");
      expect(local.time).toBe(time);
    },
  );
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

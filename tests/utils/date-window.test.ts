import { describe, expect, it } from "vitest";
import {
  computeAgendaWindow,
  shiftReferenceDate,
  todayInTimeZone,
} from "@/features/calendar/date-window";

const TZ = "America/Sao_Paulo";

describe("computeAgendaWindow", () => {
  it("dia: janela de 00:00 a 00:00 do dia seguinte no fuso da organização", () => {
    const window = computeAgendaWindow("day", "2026-03-10", TZ);
    expect(window.fromIso).toBe("2026-03-10T03:00:00.000Z");
    expect(window.toIso).toBe("2026-03-11T03:00:00.000Z");
    expect(window.days).toEqual(["2026-03-10"]);
  });

  it("semana: começa na segunda-feira e cobre 7 dias", () => {
    // 2026-03-10 é uma terça-feira.
    const window = computeAgendaWindow("week", "2026-03-10", TZ);
    expect(window.days).toEqual([
      "2026-03-09",
      "2026-03-10",
      "2026-03-11",
      "2026-03-12",
      "2026-03-13",
      "2026-03-14",
      "2026-03-15",
    ]);
    expect(window.fromIso).toBe("2026-03-09T03:00:00.000Z");
    expect(window.toIso).toBe("2026-03-16T03:00:00.000Z");
  });

  it("mês: cobre do primeiro ao último dia do mês", () => {
    const window = computeAgendaWindow("month", "2026-02-15", TZ);
    expect(window.days[0]).toBe("2026-02-01");
    expect(window.days.at(-1)).toBe("2026-02-28");
    expect(window.fromIso).toBe("2026-02-01T03:00:00.000Z");
    expect(window.toIso).toBe("2026-03-01T03:00:00.000Z");
  });
});

describe("shiftReferenceDate", () => {
  it("avança/recua um dia", () => {
    expect(shiftReferenceDate("day", "2026-03-10", 1)).toBe("2026-03-11");
    expect(shiftReferenceDate("day", "2026-03-10", -1)).toBe("2026-03-09");
  });

  it("avança/recua uma semana", () => {
    expect(shiftReferenceDate("week", "2026-03-10", 1)).toBe("2026-03-17");
  });

  it("avança/recua um mês respeitando o dia", () => {
    expect(shiftReferenceDate("month", "2026-01-31", 1)).toBe("2026-03-03");
  });
});

describe("todayInTimeZone", () => {
  it("retorna uma data no formato YYYY-MM-DD", () => {
    expect(todayInTimeZone(TZ)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

import { describe, expect, it } from "vitest";
import { elapsedSecondsBetween, formatElapsedHms } from "@/lib/utils/elapsed";

describe("formatElapsedHms", () => {
  it("formata zero como 00:00:00", () => {
    expect(formatElapsedHms(0)).toBe("00:00:00");
  });

  it("formata minutos e segundos com zero à esquerda", () => {
    expect(formatElapsedHms(62)).toBe("00:01:02");
  });

  it("formata horas completas", () => {
    expect(formatElapsedHms(3661)).toBe("01:01:01");
  });

  it("não aceita valores negativos", () => {
    expect(formatElapsedHms(-12)).toBe("00:00:00");
  });
});

describe("elapsedSecondsBetween", () => {
  it("calcula a diferença em segundos inteiros", () => {
    expect(
      elapsedSecondsBetween("2026-08-22T12:00:00.000Z", "2026-08-22T13:42:15.000Z"),
    ).toBe(1 * 3600 + 42 * 60 + 15);
  });

  it("retorna zero quando o fim é anterior ao início", () => {
    expect(
      elapsedSecondsBetween("2026-08-22T13:00:00.000Z", "2026-08-22T12:00:00.000Z"),
    ).toBe(0);
  });

  it("retorna zero para ISO inválido", () => {
    expect(elapsedSecondsBetween("não-é-data", "2026-08-22T12:00:00.000Z")).toBe(0);
  });
});

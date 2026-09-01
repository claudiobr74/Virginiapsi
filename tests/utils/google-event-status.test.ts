import { describe, expect, it } from "vitest";
import {
  countValidAgendaSessions,
  deriveImportedAppointmentStatus,
  summaryIndicatesCancellation,
} from "@/features/calendar/google-event-status";
import type { AppointmentStatus } from "@/features/calendar/contracts";

describe("summaryIndicatesCancellation", () => {
  it("detecta marcadores de desmarcação sem reescrever o título", () => {
    const original = "Vinicius-2(desmarcou)";
    expect(summaryIndicatesCancellation(original)).toBe(true);
    expect(original).toBe("Vinicius-2(desmarcou)");
    expect(summaryIndicatesCancellation("Giovanna (desmarcou)")).toBe(true);
    expect(summaryIndicatesCancellation("paciente desmarcada")).toBe(true);
    expect(summaryIndicatesCancellation("horário desmarcado")).toBe(true);
    expect(summaryIndicatesCancellation("cliente cancelou")).toBe(true);
    expect(summaryIndicatesCancellation("sessão cancelada")).toBe(true);
    expect(summaryIndicatesCancellation("evento cancelado")).toBe(true);
  });

  it("não trata (c) como cancelamento", () => {
    expect(summaryIndicatesCancellation("Ana Cláudia-1(c)")).toBe(false);
    expect(summaryIndicatesCancellation("Livia-1(c) / Flávia-3")).toBe(false);
    expect(summaryIndicatesCancellation("Helio (c)")).toBe(false);
    expect(summaryIndicatesCancellation("Lucas B+1(viajando)")).toBe(false);
  });
});

describe("deriveImportedAppointmentStatus", () => {
  it("usa status Google cancelled", () => {
    expect(
      deriveImportedAppointmentStatus({ status: "cancelled", summary: "Ana Cláudia-1(c)" }),
    ).toBe("cancelled");
  });

  it("classifica desmarcou no título mesmo com status confirmed", () => {
    expect(
      deriveImportedAppointmentStatus({
        status: "confirmed",
        summary: "Giovanna (desmarcou)",
      }),
    ).toBe("cancelled");
  });

  it("mantém scheduled para título válido", () => {
    expect(
      deriveImportedAppointmentStatus({ status: "confirmed", summary: "Ana Cláudia-1(c)" }),
    ).toBe("scheduled");
  });
});

describe("countValidAgendaSessions", () => {
  it("8 ativos + 2 cancelados + 3 horários concluídos = 11", () => {
    const week: Array<{ status: AppointmentStatus; summary_snapshot: string }> = [
      ...Array.from({ length: 8 }, (_, index) => ({
        status: "scheduled" as const,
        summary_snapshot: `Ativo ${index + 1}`,
      })),
      { status: "cancelled", summary_snapshot: "Vinicius-2(desmarcou)" },
      { status: "no_show", summary_snapshot: "Faltou" },
      ...Array.from({ length: 3 }, (_, index) => ({
        status: "confirmed" as const,
        summary_snapshot: `Encerrado ${index + 1}`,
      })),
    ];
    expect(countValidAgendaSessions(week)).toBe(11);
  });

  it("não conta desmarcou com status scheduled", () => {
    expect(
      countValidAgendaSessions([
        { status: "scheduled", summary_snapshot: "Giovanna (desmarcou)" },
        { status: "scheduled", summary_snapshot: "Ana Cláudia-1(c)" },
      ]),
    ).toBe(1);
  });
});

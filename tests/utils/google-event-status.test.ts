import { describe, expect, it } from "vitest";
import {
  countValidAgendaSessions,
  deriveImportedAppointmentStatus,
  summaryIndicatesCancellation,
} from "@/features/calendar/google-event-status";
import { getAppointmentPresentation } from "@/features/calendar/appointment-visual";
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

  it("não adiciona plantão, não pode nem interrogação como marcadores globais", () => {
    expect(summaryIndicatesCancellation("Paciente em plantão")).toBe(false);
    expect(summaryIndicatesCancellation("Isadora? não pode")).toBe(false);
    expect(summaryIndicatesCancellation("Thatiane+1(plantão)")).toBe(false);
    expect(summaryIndicatesCancellation("Ygor??? Manuela??")).toBe(false);
  });
});

describe("deriveImportedAppointmentStatus", () => {
  const clinicCancelledColor = "9";

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

  it("classifica (desmarcou) independentemente de colorId", () => {
    expect(
      deriveImportedAppointmentStatus(
        {
          status: "confirmed",
          summary: "Vinicius-2(desmarcou)",
          colorId: "11",
        },
        { cancelledColorIds: [clinicCancelledColor] },
      ),
    ).toBe("cancelled");
  });

  it("mantém scheduled para título válido", () => {
    expect(
      deriveImportedAppointmentStatus({ status: "confirmed", summary: "Ana Cláudia-1(c)" }),
    ).toBe("scheduled");
  });

  it("colorId configurado como cancelled → cancelled", () => {
    expect(
      deriveImportedAppointmentStatus(
        {
          status: "confirmed",
          summary: "Isadora? não pode",
          colorId: clinicCancelledColor,
        },
        { cancelledColorIds: [clinicCancelledColor] },
      ),
    ).toBe("cancelled");
  });

  it("mesmo título sem cancelled colorId → scheduled", () => {
    expect(
      deriveImportedAppointmentStatus(
        {
          status: "confirmed",
          summary: "Isadora? não pode",
          colorId: "11",
        },
        { cancelledColorIds: [clinicCancelledColor] },
      ),
    ).toBe("scheduled");
    expect(
      deriveImportedAppointmentStatus({
        status: "confirmed",
        summary: "Isadora? não pode",
        colorId: clinicCancelledColor,
      }),
    ).toBe("scheduled");
  });

  it("não cancela plantão só pelo texto quando a cor é de evento ativo", () => {
    expect(
      deriveImportedAppointmentStatus(
        {
          status: "confirmed",
          summary: "Paciente em plantão",
          colorId: "11",
        },
        { cancelledColorIds: [clinicCancelledColor] },
      ),
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

  it("não conta evento cancelado apenas pela cor Google da organização", () => {
    expect(
      countValidAgendaSessions([
        {
          status: "scheduled",
          summary_snapshot: "Isadora? não pode",
          google_color_id: "9",
          cancelled_google_color_ids: ["9"],
        },
        {
          status: "scheduled",
          summary_snapshot: "Jessyca-1(c)",
          google_color_id: null,
          cancelled_google_color_ids: ["9"],
        },
      ]),
    ).toBe(1);
  });
});

describe("apresentação após classificador de cor", () => {
  const now = new Date("2026-09-01T22:30:00.000Z");

  it("cancelado pela cor + horário passado permanece vermelho", () => {
    const result = getAppointmentPresentation({
      appointment: {
        status: "cancelled",
        origin: "GOOGLE_EXTERNAL",
        ends_at: "2026-09-01T22:00:00.000Z",
        summary_snapshot: "Isadora? não pode",
        google_color_id: "9",
        cancelled_google_color_ids: ["9"],
        patient_id: null,
      },
      now,
    });
    expect(result.visualState).toBe("cancelled");
    expect(result.backgroundColor).toBe("#D93025");
    expect(result.isCancelled).toBe(true);
    expect(result.isPast).toBe(true);
  });
});

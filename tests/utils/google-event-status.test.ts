import { describe, expect, it } from "vitest";
import {
  countValidAgendaSessions,
  deriveImportedAppointmentStatus,
  getAppointmentSemanticState,
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

  it("não adiciona plantão, não pode, viajando nem interrogação como marcadores globais", () => {
    expect(summaryIndicatesCancellation("Paciente em plantão")).toBe(false);
    expect(summaryIndicatesCancellation("Isadora? não pode")).toBe(false);
    expect(summaryIndicatesCancellation("Thatiane+1(plantão)")).toBe(false);
    expect(summaryIndicatesCancellation("Lucas B+1(viajando)")).toBe(false);
    expect(summaryIndicatesCancellation("Ygor??? Manuela??")).toBe(false);
  });
});

describe("deriveImportedAppointmentStatus", () => {
  it("não persiste Google status=cancelled como cancelamento clínico", () => {
    expect(
      deriveImportedAppointmentStatus({ status: "cancelled", summary: "Ana Cláudia-1(c)" }),
    ).toBe("scheduled");
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
      deriveImportedAppointmentStatus({
        status: "confirmed",
        summary: "Vinicius-2(desmarcou)",
        colorId: "8",
      }),
    ).toBe("cancelled");
  });

  it("mantém scheduled para título válido", () => {
    expect(
      deriveImportedAppointmentStatus({ status: "confirmed", summary: "Ana Cláudia-1(c)" }),
    ).toBe("scheduled");
  });

  it("não altera status persistido por colorId 8", () => {
    expect(
      deriveImportedAppointmentStatus({
        status: "confirmed",
        summary: "Lucas B+1(viajando)",
        colorId: "8",
        eventType: "default",
      }),
    ).toBe("scheduled");
    expect(
      deriveImportedAppointmentStatus({
        status: "confirmed",
        summary: "Isadora? não pode",
        colorId: "8",
        eventType: "default",
      }),
    ).toBe("scheduled");
  });
});

describe("getAppointmentSemanticState — colorId 8", () => {
  const now = new Date("2026-09-01T12:00:00.000Z");
  const unavailable = ["8"];

  it("colorId 8 + mapa unavailable → unavailable", () => {
    expect(
      getAppointmentSemanticState(
        {
          status: "scheduled",
          origin: "GOOGLE_EXTERNAL",
          summary_snapshot: "Isadora? não pode",
          google_color_id: "8",
          unavailable_google_color_ids: unavailable,
          ends_at: "2026-09-01T18:00:00.000Z",
        },
        now,
      ),
    ).toBe("unavailable");
  });

  it("colorId null → active", () => {
    expect(
      getAppointmentSemanticState(
        {
          status: "scheduled",
          origin: "GOOGLE_EXTERNAL",
          summary_snapshot: "Jessyca-1(c)",
          google_color_id: null,
          unavailable_google_color_ids: unavailable,
          ends_at: "2026-09-01T18:00:00.000Z",
        },
        now,
      ),
    ).toBe("active");
  });

  it("(desmarcou) + colorId 8 → cancelled", () => {
    expect(
      getAppointmentSemanticState(
        {
          status: "scheduled",
          origin: "GOOGLE_EXTERNAL",
          summary_snapshot: "Giovanna (desmarcou)",
          google_color_id: "8",
          unavailable_google_color_ids: unavailable,
          ends_at: "2026-09-01T18:00:00.000Z",
        },
        now,
      ),
    ).toBe("cancelled");
  });

  it("status cancelled local → cancelled", () => {
    expect(
      getAppointmentSemanticState(
        {
          status: "cancelled",
          origin: "GOOGLE_EXTERNAL",
          summary_snapshot: "Ana Cláudia-1(c)",
          google_color_id: null,
          unavailable_google_color_ids: unavailable,
          ends_at: "2026-09-01T18:00:00.000Z",
        },
        now,
      ),
    ).toBe("cancelled");
  });

  it("google_deleted_at → deleted, mesmo com título ativo", () => {
    expect(
      getAppointmentSemanticState(
        {
          status: "cancelled",
          origin: "GOOGLE_EXTERNAL",
          summary_snapshot: "Helio-1??? Julianna-1???",
          google_deleted_at: "2026-09-01T03:00:00.000Z",
          ends_at: "2026-09-01T18:00:00.000Z",
        },
        now,
      ),
    ).toBe("deleted");
  });
});

describe("countValidAgendaSessions", () => {
  it("8 ativos + 2 cancelados + 3 horários concluídos = 11", () => {
    const week: Array<{ status: AppointmentStatus; summary_snapshot: string; ends_at: string }> = [
      ...Array.from({ length: 8 }, (_, index) => ({
        status: "scheduled" as const,
        summary_snapshot: `Ativo ${index + 1}`,
        ends_at: "2026-09-02T12:00:00.000Z",
      })),
      { status: "cancelled", summary_snapshot: "Vinicius-2(desmarcou)", ends_at: "2026-09-02T12:00:00.000Z" },
      { status: "no_show", summary_snapshot: "Faltou", ends_at: "2026-09-02T12:00:00.000Z" },
      ...Array.from({ length: 3 }, (_, index) => ({
        status: "confirmed" as const,
        summary_snapshot: `Encerrado ${index + 1}`,
        ends_at: "2026-08-01T12:00:00.000Z",
      })),
    ];
    expect(countValidAgendaSessions(week)).toBe(11);
  });

  it("não conta desmarcou, unavailable nem deleted", () => {
    expect(
      countValidAgendaSessions([
        {
          status: "scheduled",
          origin: "GOOGLE_EXTERNAL",
          summary_snapshot: "Giovanna (desmarcou)",
          google_color_id: "8",
          unavailable_google_color_ids: ["8"],
          ends_at: "2026-09-02T12:00:00.000Z",
        },
        {
          status: "scheduled",
          origin: "GOOGLE_EXTERNAL",
          summary_snapshot: "Lucas B+1(viajando)",
          google_color_id: "8",
          unavailable_google_color_ids: ["8"],
          ends_at: "2026-09-02T12:00:00.000Z",
        },
        {
          status: "scheduled",
          origin: "GOOGLE_EXTERNAL",
          summary_snapshot: "Helio-1??? Julianna-1???",
          google_deleted_at: "2026-09-01T03:00:00.000Z",
          ends_at: "2026-09-02T12:00:00.000Z",
        },
        {
          status: "scheduled",
          origin: "GOOGLE_EXTERNAL",
          summary_snapshot: "Jessyca-1(c)",
          google_color_id: null,
          unavailable_google_color_ids: ["8"],
          ends_at: "2026-09-02T12:00:00.000Z",
        },
      ]),
    ).toBe(1);
  });
});

describe("apresentação V2.3", () => {
  const now = new Date("2026-09-01T12:00:00.000Z");

  it("Isadora colorId 8 → vermelho indisponível e não conta", () => {
    const appointment = {
      status: "scheduled" as const,
      origin: "GOOGLE_EXTERNAL" as const,
      ends_at: "2026-09-01T18:00:00.000Z",
      summary_snapshot: "Isadora? não pode",
      google_color_id: "8",
      unavailable_google_color_ids: ["8"],
      patient_id: null,
    };
    const result = getAppointmentPresentation({ appointment, now });
    expect(result.visualState).toBe("unavailable");
    expect(result.statusLabel).toBe("Indisponível");
    expect(result.backgroundColor).toBe("#D93025");
    expect(result.isCancelled).toBe(false);
    expect(result.isUnavailable).toBe(true);
    expect(countValidAgendaSessions([appointment])).toBe(0);
  });

  it("Thatiane e Lucas colorId 8 → vermelho indisponível", () => {
    for (const summary of ["Thatiane+1(plantão)", "Lucas B+1(viajando)"]) {
      const result = getAppointmentPresentation({
        appointment: {
          status: "scheduled",
          origin: "GOOGLE_EXTERNAL",
          ends_at: "2026-09-01T18:00:00.000Z",
          summary_snapshot: summary,
          google_color_id: "8",
          unavailable_google_color_ids: ["8"],
          patient_id: null,
        },
        now,
      });
      expect(result.visualState).toBe("unavailable");
      expect(result.statusLabel).toBe("Indisponível");
      expect(result.backgroundColor).toBe("#D93025");
    }
  });

  it("Giovanna/Vinicius (desmarcou) + colorId 8 → vermelho cancelado", () => {
    for (const summary of ["Giovanna (desmarcou)", "Vinicius-2(desmarcou)"]) {
      const result = getAppointmentPresentation({
        appointment: {
          status: "scheduled",
          origin: "GOOGLE_EXTERNAL",
          ends_at: "2026-09-01T18:00:00.000Z",
          summary_snapshot: summary,
          google_color_id: "8",
          unavailable_google_color_ids: ["8"],
          patient_id: null,
        },
        now,
      });
      expect(result.visualState).toBe("cancelled");
      expect(result.statusLabel).toBe("Cancelado");
      expect(result.backgroundColor).toBe("#D93025");
    }
  });
});

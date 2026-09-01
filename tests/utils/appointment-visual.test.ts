import { describe, expect, it } from "vitest";
import {
  getAppointmentPresentation,
  getAppointmentVisualStatus,
  offersClinicalAppointmentActions,
} from "@/features/calendar/appointment-visual";
import type { AppointmentStatus } from "@/features/calendar/contracts";

const NOW = new Date("2026-08-18T12:00:00.000Z");

function presentation(
  extras: {
    status?: AppointmentStatus;
    origin?: "TESSELI" | "GOOGLE_EXTERNAL";
    summary?: string;
    endsAt: string;
    patientId?: string | null;
  },
) {
  return getAppointmentPresentation({
    appointment: {
      status: extras.status ?? "scheduled",
      origin: extras.origin ?? "TESSELI",
      ends_at: extras.endsAt,
      summary_snapshot: extras.summary ?? null,
      patient_id: extras.patientId ?? "33333333-3333-4333-8333-333333333333",
    },
    now: NOW,
  });
}

describe("getAppointmentPresentation — fixtures reais", () => {
  it("Ana Cláudia-1(c) futuro → VERDE", () => {
    const result = presentation({
      summary: "Ana Cláudia-1(c)",
      endsAt: "2026-08-18T18:00:00.000Z",
    });
    expect(result.visualState).toBe("active");
    expect(result.backgroundColor).toBe("#34A853");
    expect(result.textColor).toBe("#ffffff");
    expect(result.isCancelled).toBe(false);
  });

  it("Livia-1(c) / Flávia-3 futuro → VERDE", () => {
    const result = presentation({
      summary: "Livia-1(c) / Flávia-3",
      endsAt: "2026-08-18T19:00:00.000Z",
    });
    expect(result.visualState).toBe("active");
    expect(result.backgroundColor).toBe("#34A853");
  });

  it("Vinicius-2(desmarcou) futuro → VERMELHO", () => {
    const result = presentation({
      summary: "Vinicius-2(desmarcou)",
      endsAt: "2026-08-18T18:00:00.000Z",
    });
    expect(result.visualState).toBe("cancelled");
    expect(result.backgroundColor).toBe("#D93025");
    expect(result.isCancelled).toBe(true);
  });

  it("Giovanna (desmarcou) futuro → VERMELHO", () => {
    const result = presentation({
      summary: "Giovanna (desmarcou)",
      endsAt: "2026-08-18T18:00:00.000Z",
    });
    expect(result.visualState).toBe("cancelled");
    expect(result.backgroundColor).toBe("#D93025");
  });

  it("Helio (c) com ends_at < now → AZUL", () => {
    const result = presentation({
      summary: "Helio (c)",
      endsAt: "2026-08-18T11:00:00.000Z",
    });
    expect(result.visualState).toBe("completed");
    expect(result.backgroundColor).toBe("#1A73E8");
    expect(result.isPast).toBe(true);
    expect(result.isCancelled).toBe(false);
  });

  it("cancelado com ends_at < now permanece VERMELHO", () => {
    const result = presentation({
      status: "cancelled",
      summary: "Evento cancelado",
      endsAt: "2026-08-18T08:00:00.000Z",
    });
    expect(result.visualState).toBe("cancelled");
    expect(result.backgroundColor).toBe("#D93025");
  });

  it("GOOGLE_EXTERNAL futuro scheduled é verde, sem cinza", () => {
    const result = presentation({
      origin: "GOOGLE_EXTERNAL",
      summary: "Reunião do conselho regional",
      endsAt: "2026-08-18T18:00:00.000Z",
      patientId: null,
    });
    expect(result.visualState).toBe("active");
    expect(result.backgroundColor).toBe("#34A853");
    expect(result.badgeLabel).toBe("Google");
  });

  it("GOOGLE_EXTERNAL desmarcou é vermelho", () => {
    const result = presentation({
      origin: "GOOGLE_EXTERNAL",
      summary: "Vinicius-2(desmarcou)",
      endsAt: "2026-08-18T18:00:00.000Z",
      patientId: null,
    });
    expect(result.visualState).toBe("cancelled");
    expect(result.backgroundColor).toBe("#D93025");
    expect(result.badgeLabel).toBe("Google");
  });

  it("Isadora? não pode sem colorId configurado permanece verde", () => {
    const result = presentation({
      origin: "GOOGLE_EXTERNAL",
      summary: "Isadora? não pode",
      endsAt: "2026-08-18T22:00:00.000Z",
      patientId: null,
    });
    expect(result.visualState).toBe("active");
    expect(result.backgroundColor).toBe("#34A853");
  });

  it("indisponível pela cor da organização permanece vermelho depois do horário", () => {
    const result = getAppointmentPresentation({
      appointment: {
        status: "scheduled",
        origin: "GOOGLE_EXTERNAL",
        ends_at: "2026-08-18T08:00:00.000Z",
        summary_snapshot: "Thatiane+1(plantão)",
        google_color_id: "8",
        unavailable_google_color_ids: ["8"],
        patient_id: null,
      },
      now: NOW,
    });
    expect(result.visualState).toBe("unavailable");
    expect(result.backgroundColor).toBe("#D93025");
    expect(result.statusLabel).toBe("Indisponível");
  });

  it("não usa colorId nem origem para o preenchimento", () => {
    const visual = getAppointmentVisualStatus(
      {
        status: "scheduled",
        origin: "GOOGLE_EXTERNAL",
        ends_at: "2026-08-18T18:00:00.000Z",
        patient_id: null,
      },
      NOW,
    );
    expect(visual.borderStyle).toBe("solid");
    expect(visual.style.borderStyle).toBe("solid");
    expect(visual.badge).toBe("Google");
    expect(visual.className).toBe("bg-[#34A853] text-white");
  });
});

describe("offersClinicalAppointmentActions", () => {
  it("GOOGLE_EXTERNAL sem paciente não recebe ações clínicas", () => {
    expect(
      offersClinicalAppointmentActions({ origin: "GOOGLE_EXTERNAL", patient_id: null }),
    ).toBe(false);
  });

  it("TESSELI com paciente recebe ações clínicas", () => {
    expect(
      offersClinicalAppointmentActions({
        origin: "TESSELI",
        patient_id: "33333333-3333-4333-8333-333333333333",
      }),
    ).toBe(true);
  });
});

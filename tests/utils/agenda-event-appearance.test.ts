import { describe, expect, it } from "vitest";
import type { AppointmentRow } from "@/features/calendar/contracts";
import {
  calendarEventAriaLabel,
  calendarEventTone,
  calendarStatusLabel,
  toneForStatus,
} from "@/features/calendar/event-appearance";

function stub(
  extras: Partial<AppointmentRow> & Pick<AppointmentRow, "status" | "origin">,
): AppointmentRow {
  return {
    id: extras.id ?? "11111111-1111-4111-8111-111111111111",
    organization_id: "22222222-2222-4222-8222-222222222222",
    patient_id: null,
    starts_at: extras.starts_at ?? "2026-08-18T17:00:00.000Z",
    ends_at: extras.ends_at ?? "2026-08-18T17:50:00.000Z",
    modality: extras.modality ?? "in_person",
    managed_by_tesseli: extras.origin === "TESSELI",
    google_calendar_id: null,
    google_event_id: null,
    meet_url: null,
    meet_status: "none",
    summary_snapshot: extras.summary_snapshot ?? "Maria Silva",
    sync_status: "idle",
    ...extras,
  };
}

describe("calendarEventTone", () => {
  it("mapeia scheduled e confirmed para ativo (verde)", () => {
    expect(calendarEventTone(stub({ status: "scheduled", origin: "TESSELI" }))).toBe("active");
    expect(calendarEventTone(stub({ status: "confirmed", origin: "TESSELI" }))).toBe("active");
  });

  it("mapeia completed para realizado (azul)", () => {
    expect(calendarEventTone(stub({ status: "completed", origin: "TESSELI" }))).toBe("completed");
  });

  it("mapeia cancelled para vermelho suave", () => {
    expect(calendarEventTone(stub({ status: "cancelled", origin: "TESSELI" }))).toBe("cancelled");
  });

  it("não pinta evento Google externo com a semântica clínica", () => {
    expect(
      calendarEventTone(stub({ status: "scheduled", origin: "GOOGLE_EXTERNAL" })),
    ).toBe("external");
    expect(
      calendarEventTone(stub({ status: "cancelled", origin: "GOOGLE_EXTERNAL" })),
    ).toBe("external");
  });

  it("trata no_show como tom distinto, fora do verde/azul/vermelho", () => {
    expect(calendarEventTone(stub({ status: "no_show", origin: "TESSELI" }))).toBe("noshow");
  });

  it("aceita aliases de status sem criar enum novo", () => {
    expect(toneForStatus("pending")).toBe("active");
    expect(toneForStatus("finished")).toBe("completed");
    expect(toneForStatus("canceled")).toBe("cancelled");
  });
});

describe("calendarStatusLabel", () => {
  it("usa rótulos compactos da Agenda", () => {
    expect(calendarStatusLabel(stub({ status: "scheduled", origin: "TESSELI" }))).toBe("Agendado");
    expect(calendarStatusLabel(stub({ status: "confirmed", origin: "TESSELI" }))).toBe("Confirmado");
    expect(calendarStatusLabel(stub({ status: "completed", origin: "TESSELI" }))).toBe("Realizado");
    expect(calendarStatusLabel(stub({ status: "cancelled", origin: "TESSELI" }))).toBe("Cancelado");
  });
});

describe("calendarEventAriaLabel", () => {
  it("inclui horário, paciente e status", () => {
    const label = calendarEventAriaLabel(
      stub({
        status: "confirmed",
        origin: "TESSELI",
        summary_snapshot: "Maria Silva",
        starts_at: "2026-08-18T17:00:00.000Z",
        ends_at: "2026-08-18T17:50:00.000Z",
      }),
      "America/Sao_Paulo",
    );
    expect(label).toMatch(/Maria Silva/);
    expect(label).toMatch(/14:00/);
    expect(label).toMatch(/Confirmado/);
  });

  it("anuncia evento externo do Google", () => {
    const label = calendarEventAriaLabel(
      stub({
        status: "scheduled",
        origin: "GOOGLE_EXTERNAL",
        summary_snapshot: "Reunião do conselho regional",
      }),
      "America/Sao_Paulo",
    );
    expect(label).toMatch(/Reunião do conselho regional/);
    expect(label).toMatch(/Evento externo do Google/);
  });
});

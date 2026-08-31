import { describe, expect, it } from "vitest";
import {
  APPOINTMENT_VISUAL_SURFACE,
  getAppointmentVisualStatus,
} from "@/features/calendar/appointment-visual";
import type { AppointmentRow } from "@/features/calendar/contracts";

function stub(extras: Partial<AppointmentRow> & Pick<AppointmentRow, "status" | "origin">): AppointmentRow {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    organization_id: "22222222-2222-4222-8222-222222222222",
    patient_id: extras.patient_id ?? "33333333-3333-4333-8333-333333333333",
    starts_at: "2026-08-18T12:00:00.000Z",
    ends_at: "2026-08-18T13:00:00.000Z",
    modality: "online",
    managed_by_tesseli: extras.origin === "TESSELI",
    google_calendar_id: extras.origin === "GOOGLE_EXTERNAL" ? "primary" : null,
    google_event_id: extras.origin === "GOOGLE_EXTERNAL" ? "evt-1" : null,
    meet_url: null,
    meet_status: "none",
    summary_snapshot: extras.summary_snapshot ?? null,
    sync_status: "synced",
    ...extras,
  };
}

describe("getAppointmentVisualStatus", () => {
  it("usa classes estáticas, sem interpolação Tailwind", () => {
    expect(APPOINTMENT_VISUAL_SURFACE.active).toBe(
      "bg-green-100 border-green-500 text-green-900",
    );
    expect(APPOINTMENT_VISUAL_SURFACE.completed).toBe(
      "bg-blue-100 border-blue-500 text-blue-900",
    );
    expect(APPOINTMENT_VISUAL_SURFACE.cancelled).toBe(
      "bg-red-100 border-red-400 text-red-800 opacity-75",
    );
    expect(APPOINTMENT_VISUAL_SURFACE.neutral).toBe(
      "bg-stone-100 border-stone-300 text-stone-800",
    );
    expect(JSON.stringify(APPOINTMENT_VISUAL_SURFACE)).not.toMatch(/bg-\$\{/);
  });

  it("Consulta A scheduled → verde (active)", () => {
    const visual = getAppointmentVisualStatus(
      stub({ status: "scheduled", origin: "TESSELI", summary_snapshot: "Consulta A" }),
    );
    expect(visual.tone).toBe("active");
    expect(visual.className).toContain("bg-green-100");
    expect(visual.className).toContain("border-green-500");
    expect(visual.className).toContain("text-green-900");
  });

  it("confirmed também é ativo/verde — não usa cor do Google", () => {
    const visual = getAppointmentVisualStatus(
      stub({
        status: "confirmed",
        origin: "TESSELI",
        modality: "in_person",
        sync_status: "error",
        google_event_id: "google-color-would-be-ignored",
      }),
    );
    expect(visual.tone).toBe("active");
    expect(visual.className).toContain("bg-green-100");
  });

  it("Consulta B completed → azul", () => {
    const visual = getAppointmentVisualStatus(
      stub({ status: "completed", origin: "TESSELI", summary_snapshot: "Consulta B" }),
    );
    expect(visual.tone).toBe("completed");
    expect(visual.className).toContain("bg-blue-100");
    expect(visual.className).toContain("border-blue-500");
    expect(visual.className).toContain("text-blue-900");
  });

  it("Consulta C cancelled → vermelho suave", () => {
    const visual = getAppointmentVisualStatus(
      stub({ status: "cancelled", origin: "TESSELI", summary_snapshot: "Consulta C" }),
    );
    expect(visual.tone).toBe("cancelled");
    expect(visual.className).toContain("bg-red-100");
    expect(visual.className).toContain("border-red-400");
    expect(visual.className).toContain("text-red-800");
    expect(visual.className).toContain("opacity-75");
    expect(visual.titleClassName).toContain("line-through");
  });

  it("Evento D GOOGLE_EXTERNAL sem consulta associada → neutro", () => {
    const visual = getAppointmentVisualStatus(
      stub({
        status: "scheduled",
        origin: "GOOGLE_EXTERNAL",
        patient_id: null,
        managed_by_tesseli: false,
        summary_snapshot: "Evento D",
      }),
    );
    expect(visual.tone).toBe("neutral");
    expect(visual.className).toContain("bg-stone-100");
    expect(visual.className).toContain("border-stone-300");
    expect(visual.className).not.toContain("bg-green-100");
  });

  it("Google associado a consulta VirgíniaPsi prevalece o status clínico", () => {
    const visual = getAppointmentVisualStatus(
      stub({
        status: "completed",
        origin: "GOOGLE_EXTERNAL",
        patient_id: "33333333-3333-4333-8333-333333333333",
        managed_by_tesseli: false,
      }),
    );
    expect(visual.tone).toBe("completed");
    expect(visual.className).toContain("bg-blue-100");
  });

  it("no_show usa o tom de cancelado", () => {
    expect(
      getAppointmentVisualStatus(stub({ status: "no_show", origin: "TESSELI" })).tone,
    ).toBe("cancelled");
  });
});

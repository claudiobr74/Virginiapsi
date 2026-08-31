import { describe, expect, it } from "vitest";
import { getAppointmentVisualStatus } from "@/features/calendar/appointment-visual";
import type { AppointmentStatus } from "@/features/calendar/contracts";

describe("getAppointmentVisualStatus", () => {
  it("scheduled e confirmed são verde (ativo)", () => {
    for (const status of ["scheduled", "confirmed"] as const) {
      const visual = getAppointmentVisualStatus({
        status,
        origin: "TESSELI",
        patient_id: "33333333-3333-4333-8333-333333333333",
      });
      expect(visual.tone).toBe("active");
      expect(visual.className).toBe("bg-green-100 border-green-500 text-green-900");
      expect(visual.style.backgroundColor).toBe("#dcfce7");
      expect(visual.style.borderColor).toBe("#22c55e");
      expect(visual.style.color).toBe("#14532d");
    }
  });

  it("completed é azul", () => {
    const visual = getAppointmentVisualStatus({
      status: "completed",
      origin: "TESSELI",
      patient_id: "33333333-3333-4333-8333-333333333333",
    });
    expect(visual.tone).toBe("completed");
    expect(visual.className).toBe("bg-blue-100 border-blue-500 text-blue-900");
    expect(visual.style.backgroundColor).toBe("#dbeafe");
    expect(visual.style.borderColor).toBe("#3b82f6");
    expect(visual.style.color).toBe("#1e3a8a");
  });

  it("cancelled e no_show são vermelho suave", () => {
    for (const status of ["cancelled", "no_show"] as const satisfies AppointmentStatus[]) {
      const visual = getAppointmentVisualStatus({
        status,
        origin: "TESSELI",
        patient_id: "33333333-3333-4333-8333-333333333333",
      });
      expect(visual.tone).toBe("cancelled");
      expect(visual.className).toContain("bg-red-100");
      expect(visual.className).toContain("border-red-400");
      expect(visual.className).toContain("text-red-800");
      expect(visual.style.backgroundColor).toBe("#fee2e2");
      expect(visual.style.borderColor).toBe("#f87171");
      expect(visual.style.color).toBe("#991b1b");
      expect(visual.style.opacity).toBe(0.75);
      expect(visual.titleClassName).toContain("line-through");
    }
  });

  it("GOOGLE_EXTERNAL sem paciente é neutro mesmo com status scheduled", () => {
    const visual = getAppointmentVisualStatus({
      status: "scheduled",
      origin: "GOOGLE_EXTERNAL",
      patient_id: null,
    });
    expect(visual.tone).toBe("neutral");
    expect(visual.className).toBe("bg-zinc-100 border-zinc-400 text-zinc-900");
    expect(visual.style.backgroundColor).toBe("#f4f4f5");
    expect(visual.style.borderStyle).toBe("dashed");
    expect(visual.className).not.toContain("bg-green-100");
  });

  it("GOOGLE_EXTERNAL associado a consulta usa o status clínico", () => {
    const visual = getAppointmentVisualStatus({
      status: "completed",
      origin: "GOOGLE_EXTERNAL",
      patient_id: "33333333-3333-4333-8333-333333333333",
    });
    expect(visual.tone).toBe("completed");
    expect(visual.className).toContain("bg-blue-100");
    expect(visual.style.backgroundColor).toBe("#dbeafe");
  });

  it("não interpola classes Tailwind", () => {
    const visual = getAppointmentVisualStatus({
      status: "scheduled",
      origin: "TESSELI",
      patient_id: "33333333-3333-4333-8333-333333333333",
    });
    expect(visual.className).not.toMatch(/bg-\$\{/);
    expect(visual.style.backgroundColor).toMatch(/^#/);
  });
});

import { describe, expect, it } from "vitest";
import { appointmentFormSchema } from "@/features/calendar/contracts";

describe("appointmentFormSchema", () => {
  const base = {
    date: "2026-09-02",
    startTime: "10:00",
    durationMinutes: "50",
    modality: "in_person" as const,
    createMeet: false,
  };

  it("exige título quando não há paciente", () => {
    const parsed = appointmentFormSchema.safeParse({ ...base, title: "  ", patientId: "" });
    expect(parsed.success).toBe(false);
  });

  it("aceita título livre sem paciente", () => {
    const parsed = appointmentFormSchema.safeParse({
      ...base,
      title: "Lucas B+1(viajando)",
      patientId: "",
    });
    expect(parsed.success).toBe(true);
  });

  it("aceita paciente sem título — o servidor sugere o nome", () => {
    const parsed = appointmentFormSchema.safeParse({
      ...base,
      title: "",
      patientId: "33333333-3333-4333-8333-333333333333",
    });
    expect(parsed.success).toBe(true);
  });
});

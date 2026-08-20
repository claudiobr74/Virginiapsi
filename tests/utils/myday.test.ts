import { describe, expect, it } from "vitest";
import {
  buildWhatsAppReminderUrl,
  patientDisplayLabel,
  selectNextSession,
  type MyDayAppointment,
} from "@/features/dashboard/contracts";

function appointment(overrides: Partial<MyDayAppointment> = {}): MyDayAppointment {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    startsAt: "2026-08-20T12:00:00.000Z",
    endsAt: "2026-08-20T12:50:00.000Z",
    status: "scheduled",
    modality: "in_person",
    origin: "SERENAPSI",
    summarySnapshot: "Beatriz Lima • PAC-001",
    meetUrl: null,
    meetStatus: "none",
    patientId: "22222222-2222-4222-8222-222222222222",
    patientPreferredName: "Beatriz",
    patientPublicCode: "PAC-001",
    patientPhone: "11988887777",
    ...overrides,
  };
}

describe("patientDisplayLabel", () => {
  it("usa nome preferencial e código público quando existem", () => {
    expect(patientDisplayLabel(appointment())).toBe("Beatriz • PAC-001");
  });

  it("cai no snapshot quando não há paciente vinculado", () => {
    expect(
      patientDisplayLabel(
        appointment({
          patientPreferredName: null,
          patientPublicCode: null,
          summarySnapshot: "Consulta avulsa",
        }),
      ),
    ).toBe("Consulta avulsa");
  });
});

describe("selectNextSession", () => {
  it("escolhe a primeira consulta que ainda não terminou", () => {
    const past = appointment({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      startsAt: "2026-08-20T10:00:00.000Z",
      endsAt: "2026-08-20T10:50:00.000Z",
    });
    const next = appointment({
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      startsAt: "2026-08-20T14:00:00.000Z",
      endsAt: "2026-08-20T14:50:00.000Z",
    });
    const now = Date.parse("2026-08-20T12:00:00.000Z");
    expect(selectNextSession([past, next], now)?.id).toBe(next.id);
  });

  it("retorna null quando o dia já passou", () => {
    const past = appointment({
      startsAt: "2026-08-20T10:00:00.000Z",
      endsAt: "2026-08-20T10:50:00.000Z",
    });
    const now = Date.parse("2026-08-20T18:00:00.000Z");
    expect(selectNextSession([past], now)).toBeNull();
  });
});

describe("buildWhatsAppReminderUrl", () => {
  it("monta deep-link E.164 com texto administrativo, sem conteúdo clínico", () => {
    const url = buildWhatsAppReminderUrl(
      "11988887777",
      "Beatriz",
      "2026-08-20T12:00:00.000Z",
      "America/Sao_Paulo",
    );
    expect(url).toMatch(/^https:\/\/wa\.me\/5511988887777\?text=/);
    const text = decodeURIComponent(new URL(url ?? "").searchParams.get("text") ?? "");
    expect(text).toContain("Beatriz");
    expect(text).toContain("confirmar");
    expect(text.toLowerCase()).not.toMatch(/ansiedade|diagnóstico|prontuário/);
  });

  it("aceita número já com DDI 55", () => {
    const url = buildWhatsAppReminderUrl(
      "+55 11 98888-7777",
      "Beatriz",
      "2026-08-20T12:00:00.000Z",
      "America/Sao_Paulo",
    );
    expect(url).toMatch(/^https:\/\/wa\.me\/5511988887777\?text=/);
  });

  it("retorna null para telefone incompleto", () => {
    expect(
      buildWhatsAppReminderUrl("123", "Beatriz", "2026-08-20T12:00:00.000Z", "UTC"),
    ).toBeNull();
  });
});

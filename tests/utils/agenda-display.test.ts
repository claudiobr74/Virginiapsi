import { describe, expect, it } from "vitest";
import {
  buildDayTimelineHours,
  formatAgendaLongDate,
  formatAgendaMonthLabel,
  formatHourLabel,
  googleConnectionIsLive,
  hourInTimeZone,
  monthCellStats,
  summarizeDayAppointments,
  visibleAgendaAppointments,
  visibleAppointments,
} from "@/features/calendar/display";
import type { AppointmentRow } from "@/features/calendar/contracts";

function stubAppointment(
  extras: Partial<AppointmentRow> & Pick<AppointmentRow, "starts_at" | "status" | "origin">,
): AppointmentRow {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    organization_id: "22222222-2222-4222-8222-222222222222",
    patient_id: null,
    ends_at: extras.starts_at,
    modality: "in_person",
    managed_by_tesseli: extras.origin === "TESSELI",
    google_calendar_id: null,
    google_event_id: null,
    meet_url: null,
    meet_status: "none",
    summary_snapshot: null,
    sync_status: "idle",
    ...extras,
  };
}

describe("formatAgendaLongDate", () => {
  it("formata o dia em pt-BR com a primeira letra maiúscula", () => {
    expect(formatAgendaLongDate("2026-08-18")).toMatch(/^[A-ZÁÉÍÓÚÂÊÔÃÕÇ].*18.*agosto.*2026/i);
  });
});

describe("formatAgendaMonthLabel", () => {
  it("mostra mês e ano", () => {
    expect(formatAgendaMonthLabel("2026-08-18")).toMatch(/agosto de 2026/i);
  });
});

describe("hourInTimeZone", () => {
  it("lê a hora civil em America/Sao_Paulo", () => {
    expect(hourInTimeZone("2026-08-18T12:00:00.000Z", "America/Sao_Paulo")).toBe(9);
  });
});

describe("buildDayTimelineHours", () => {
  it("inclui a faixa 7–20 e horas extras de consultas", () => {
    const hours = buildDayTimelineHours(
      [{ starts_at: "2026-08-18T00:00:00.000Z" }],
      "America/Sao_Paulo",
    );
    expect(hours[0]).toBe(7);
    expect(hours.at(-1)).toBe(21);
    expect(hours).toContain(19);
    expect(hours).toContain(20);
  });
});

describe("formatHourLabel", () => {
  it("zero-pad", () => {
    expect(formatHourLabel(8)).toBe("08:00");
  });
});

describe("summarizeDayAppointments", () => {
  it("ignora canceladas e conta origem externa", () => {
    const summary = summarizeDayAppointments([
      stubAppointment({
        starts_at: "2026-08-18T12:00:00.000Z",
        status: "confirmed",
        origin: "TESSELI",
      }),
      stubAppointment({
        starts_at: "2026-08-18T13:00:00.000Z",
        status: "scheduled",
        origin: "TESSELI",
      }),
      stubAppointment({
        starts_at: "2026-08-18T14:00:00.000Z",
        status: "cancelled",
        origin: "TESSELI",
      }),
      stubAppointment({
        starts_at: "2026-08-18T15:00:00.000Z",
        status: "scheduled",
        origin: "GOOGLE_EXTERNAL",
      }),
    ]);
    expect(summary).toEqual({ total: 3, confirmed: 1, scheduled: 2, external: 1 });
  });
});

describe("monthCellStats", () => {
  it("conta sessões e distingue modalidade e eventos externos", () => {
    const stats = monthCellStats([
      stubAppointment({
        starts_at: "2026-08-18T12:00:00.000Z",
        status: "confirmed",
        origin: "TESSELI",
        modality: "online",
      }),
      stubAppointment({
        starts_at: "2026-08-18T13:00:00.000Z",
        status: "scheduled",
        origin: "TESSELI",
        modality: "in_person",
      }),
      stubAppointment({
        starts_at: "2026-08-18T14:00:00.000Z",
        status: "cancelled",
        origin: "TESSELI",
        modality: "online",
      }),
      stubAppointment({
        starts_at: "2026-08-18T15:00:00.000Z",
        status: "scheduled",
        origin: "GOOGLE_EXTERNAL",
        modality: "online",
      }),
    ]);
    expect(stats).toEqual({
      count: 3,
      hasOnline: true,
      hasInPerson: true,
      hasExternal: true,
    });
  });
});

describe("visibleAppointments", () => {
  it("é a mesma função da Agenda e do Meu Dia", () => {
    expect(visibleAppointments).toBe(visibleAgendaAppointments);
  });

  it("esconde GOOGLE_EXTERNAL quando a Agenda está desconectada", () => {
    const appointments = [
      stubAppointment({
        starts_at: "2026-08-18T12:00:00.000Z",
        status: "scheduled",
        origin: "TESSELI",
      }),
      stubAppointment({
        id: "33333333-3333-4333-8333-333333333333",
        starts_at: "2026-08-18T15:00:00.000Z",
        status: "scheduled",
        origin: "GOOGLE_EXTERNAL",
      }),
    ];

    expect(
      visibleAppointments(appointments, { status: "disconnected" }).map((row) => row.origin),
    ).toEqual(["TESSELI"]);
    expect(visibleAppointments(appointments, null).map((row) => row.origin)).toEqual([
      "TESSELI",
    ]);
    expect(
      visibleAppointments(appointments, { status: "connected" }).map((row) => row.origin),
    ).toEqual(["TESSELI", "GOOGLE_EXTERNAL"]);
    expect(
      visibleAgendaAppointments(appointments, { status: "connected" }).map((row) => row.origin),
    ).toEqual(["TESSELI", "GOOGLE_EXTERNAL"]);
  });

  it("googleConnectionIsLive é false quando desconectado — query da Agenda deve ser managedOnly", () => {
    expect(googleConnectionIsLive({ status: "disconnected" })).toBe(false);
    expect(googleConnectionIsLive(null)).toBe(false);
    expect(googleConnectionIsLive({ status: "connected" })).toBe(true);
    expect(googleConnectionIsLive({ status: "error" })).toBe(true);
  });
});

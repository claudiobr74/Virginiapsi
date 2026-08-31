import { describe, expect, it } from "vitest";
import type { AppointmentRow } from "@/features/calendar/contracts";
import {
  agendaHourRange,
  layoutTimedEvents,
  timedEventPosition,
} from "@/features/calendar/event-layout";

function stub(
  extras: Partial<AppointmentRow> &
    Pick<AppointmentRow, "id" | "starts_at" | "ends_at">,
): AppointmentRow {
  return {
    organization_id: "22222222-2222-4222-8222-222222222222",
    patient_id: null,
    status: "scheduled",
    modality: "in_person",
    origin: "TESSELI",
    managed_by_tesseli: true,
    google_calendar_id: null,
    google_event_id: null,
    meet_url: null,
    meet_status: "none",
    summary_snapshot: "Paciente",
    sync_status: "idle",
    ...extras,
  };
}

describe("layoutTimedEvents", () => {
  it("coloca eventos simultâneos lado a lado", () => {
    const layout = layoutTimedEvents(
      [
        stub({
          id: "11111111-1111-4111-8111-111111111111",
          starts_at: "2026-08-18T13:00:00.000Z",
          ends_at: "2026-08-18T14:00:00.000Z",
        }),
        stub({
          id: "11111111-1111-4111-8111-111111111112",
          starts_at: "2026-08-18T13:30:00.000Z",
          ends_at: "2026-08-18T14:30:00.000Z",
        }),
      ],
      "America/Sao_Paulo",
    );
    expect(layout).toHaveLength(2);
    expect(layout.every((item) => item.columns === 2)).toBe(true);
    expect(new Set(layout.map((item) => item.column)).size).toBe(2);
  });

  it("mantém eventos sem sobreposição na mesma coluna", () => {
    const layout = layoutTimedEvents(
      [
        stub({
          id: "11111111-1111-4111-8111-111111111111",
          starts_at: "2026-08-18T12:00:00.000Z",
          ends_at: "2026-08-18T12:50:00.000Z",
        }),
        stub({
          id: "11111111-1111-4111-8111-111111111112",
          starts_at: "2026-08-18T13:00:00.000Z",
          ends_at: "2026-08-18T13:50:00.000Z",
        }),
      ],
      "America/Sao_Paulo",
    );
    expect(layout.every((item) => item.column === 0 && item.columns === 1)).toBe(true);
  });

  it("preserva a cor/status de cada evento no layout (não mistura ids)", () => {
    const cancelled = stub({
      id: "11111111-1111-4111-8111-111111111113",
      starts_at: "2026-08-18T13:00:00.000Z",
      ends_at: "2026-08-18T13:50:00.000Z",
      status: "cancelled",
    });
    const active = stub({
      id: "11111111-1111-4111-8111-111111111114",
      starts_at: "2026-08-18T13:00:00.000Z",
      ends_at: "2026-08-18T13:50:00.000Z",
      status: "confirmed",
    });
    const layout = layoutTimedEvents([cancelled, active], "America/Sao_Paulo");
    expect(layout.find((item) => item.appointment.id === cancelled.id)?.appointment.status).toBe(
      "cancelled",
    );
    expect(layout.find((item) => item.appointment.id === active.id)?.appointment.status).toBe(
      "confirmed",
    );
  });
});

describe("timedEventPosition", () => {
  it("escala a altura pela duração", () => {
    const [item] = layoutTimedEvents(
      [
        stub({
          id: "11111111-1111-4111-8111-111111111111",
          starts_at: "2026-08-18T17:00:00.000Z",
          ends_at: "2026-08-18T17:50:00.000Z",
        }),
      ],
      "America/Sao_Paulo",
    );
    const position = timedEventPosition(item, 7);
    expect(position.height).toBeCloseTo((50 / 60) * 48, 5);
    expect(position.top).toBeCloseTo(7 * 48, 5);
  });
});

describe("agendaHourRange", () => {
  it("usa a faixa padrão 7–21 quando não há consultas", () => {
    expect(agendaHourRange([], "America/Sao_Paulo")).toEqual({
      startHour: 7,
      endHour: 21,
    });
  });
});

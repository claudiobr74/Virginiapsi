import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppointmentCard } from "@/features/calendar/components/appointment-card";
import { DayView } from "@/features/calendar/components/day-view";
import { MonthView } from "@/features/calendar/components/month-view";
import { WeekView } from "@/features/calendar/components/week-view";
import type { AppointmentRow } from "@/features/calendar/contracts";

vi.mock("@/features/sessions/components/start-session-button", () => ({
  StartSessionButton: () => null,
}));

const TIME_ZONE = "America/Sao_Paulo";
const DAY = "2026-08-18";
const START = "2026-08-18T12:00:00.000Z";

function stub(
  extras: Partial<AppointmentRow> &
    Pick<AppointmentRow, "id" | "status" | "origin" | "summary_snapshot">,
): AppointmentRow {
  return {
    organization_id: "22222222-2222-4222-8222-222222222222",
    patient_id: extras.origin === "GOOGLE_EXTERNAL" ? null : "33333333-3333-4333-8333-333333333333",
    starts_at: START,
    ends_at: "2026-08-18T13:00:00.000Z",
    modality: extras.modality ?? "online",
    managed_by_tesseli: extras.origin === "TESSELI",
    google_calendar_id: extras.origin === "GOOGLE_EXTERNAL" ? "primary" : null,
    google_event_id: extras.origin === "GOOGLE_EXTERNAL" ? "evt-d" : null,
    meet_url: null,
    meet_status: "none",
    sync_status: "synced",
    ...extras,
  };
}

const consultaA = stub({
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  status: "scheduled",
  origin: "TESSELI",
  summary_snapshot: "Consulta A",
  modality: "online",
});
const consultaB = stub({
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  status: "completed",
  origin: "TESSELI",
  summary_snapshot: "Consulta B",
  modality: "in_person",
  starts_at: "2026-08-18T14:00:00.000Z",
  ends_at: "2026-08-18T15:00:00.000Z",
});
const consultaC = stub({
  id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  status: "cancelled",
  origin: "TESSELI",
  summary_snapshot: "Consulta C",
  starts_at: "2026-08-18T16:00:00.000Z",
  ends_at: "2026-08-18T17:00:00.000Z",
});
const eventoD = stub({
  id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  status: "scheduled",
  origin: "GOOGLE_EXTERNAL",
  patient_id: null,
  managed_by_tesseli: false,
  summary_snapshot: "Evento D",
  starts_at: "2026-08-18T18:00:00.000Z",
  ends_at: "2026-08-18T19:00:00.000Z",
});

const appointments = [consultaA, consultaB, consultaC, eventoD];

function byDay(rows: AppointmentRow[]) {
  const map = new Map<string, AppointmentRow[]>();
  map.set(DAY, rows);
  return map;
}

function expectTone(name: string, tone: string, classes: string[]) {
  const matches = screen.getAllByText(name);
  expect(matches.length).toBeGreaterThan(0);
  for (const match of matches) {
    const node = match.closest("[data-appointment-visual]");
    expect(node).toHaveAttribute("data-appointment-visual", tone);
    for (const className of classes) {
      expect(node).toHaveClass(className);
    }
  }
}

describe("Agenda — cores por status em dia/semana/mês", () => {
  it("DayView pinta A verde, B azul, C vermelho suave, D neutro", () => {
    render(
      <DayView
        appointments={appointments}
        timeZone={TIME_ZONE}
        onSelect={() => undefined}
      />,
    );

    expectTone("Consulta A", "active", ["bg-green-100", "border-green-500", "text-green-900"]);
    expectTone("Consulta B", "completed", ["bg-blue-100", "border-blue-500", "text-blue-900"]);
    expectTone("Consulta C", "cancelled", ["bg-red-100", "border-red-400", "text-red-800"]);
    expectTone("Evento D", "neutral", ["bg-zinc-100", "border-zinc-400", "text-zinc-900"]);
    expect(screen.getAllByText("Consulta A")[0].closest("[data-appointment-visual]")).not.toHaveClass(
      "bg-card",
    );
  });

  it("WeekView (chip desktop e card mobile) usa a mesma paleta", () => {
    render(
      <WeekView
        days={[DAY]}
        appointmentsByDay={byDay(appointments)}
        timeZone={TIME_ZONE}
        today={DAY}
        onSelect={() => undefined}
      />,
    );

    expectTone("Consulta A", "active", ["bg-green-100"]);
    expectTone("Consulta B", "completed", ["bg-blue-100"]);
    expectTone("Consulta C", "cancelled", ["bg-red-100"]);
    expectTone("Evento D", "neutral", ["bg-zinc-100"]);
    for (const node of screen.getAllByText("Consulta A")) {
      expect(node.closest("[data-appointment-visual]")).not.toHaveClass("bg-sage-light/80");
    }
    for (const node of screen.getAllByText("Consulta B")) {
      expect(node.closest("[data-appointment-visual]")).not.toHaveClass("bg-soft-amber");
    }
  });

  it("MonthView mostra pills com a mesma paleta, não pontos de modalidade", () => {
    render(
      <MonthView
        days={[DAY]}
        appointmentsByDay={byDay(appointments)}
        today={DAY}
        onSelectDay={() => undefined}
      />,
    );

    expectTone("Consulta A", "active", ["bg-green-100", "border-green-500"]);
    expectTone("Consulta B", "completed", ["bg-blue-100", "border-blue-500"]);
    expectTone("Consulta C", "cancelled", ["bg-red-100", "border-red-400"]);
    expectTone("Evento D", "neutral", ["bg-zinc-100", "border-zinc-400"]);
  });

  it("AppointmentCard scheduled online não fica verde só porque é Google/online", () => {
    render(<AppointmentCard appointment={consultaA} timeZone={TIME_ZONE} />);
    const card = screen.getByText("Consulta A").closest("[data-appointment-visual]");
    expect(card).toHaveAttribute("data-appointment-visual", "active");
    expect(card).toHaveClass("bg-green-100");
    expect(card).not.toHaveClass("bg-sage-light/80");
    expect(card).not.toHaveClass("bg-card");
  });
});

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppointmentCard } from "@/features/calendar/components/appointment-card";
import { AppointmentDetailDrawer } from "@/features/calendar/components/appointment-detail-drawer";
import { DayView } from "@/features/calendar/components/day-view";
import { MonthView } from "@/features/calendar/components/month-view";
import { WeekView } from "@/features/calendar/components/week-view";
import type { AppointmentRow } from "@/features/calendar/contracts";
import { TodayTimeline } from "@/features/dashboard/components/today-timeline";
import type { MyDayAppointment } from "@/features/dashboard/contracts";

vi.mock("@/features/sessions/components/start-session-button", () => ({
  StartSessionButton: () => null,
}));

vi.mock("@/features/calendar/appointment-actions", () => ({
  cancelAppointmentAction: vi.fn(),
  updateAppointmentStatusAction: vi.fn(),
}));

vi.mock("@/features/calendar/sync-actions", () => ({
  pushAppointmentToGoogleAction: vi.fn(),
  requestMeetForAppointmentAction: vi.fn(),
}));

vi.mock("@/features/dashboard/components/session-actions", () => ({
  SessionActions: () => null,
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

const consultaNoShow = stub({
  id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
  status: "no_show",
  origin: "TESSELI",
  summary_snapshot: "Consulta E",
  starts_at: "2026-08-18T19:00:00.000Z",
  ends_at: "2026-08-18T20:00:00.000Z",
});
const consultaConfirmed = stub({
  id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
  status: "confirmed",
  origin: "TESSELI",
  summary_snapshot: "Consulta Confirmada",
  starts_at: "2026-08-18T10:00:00.000Z",
  ends_at: "2026-08-18T11:00:00.000Z",
});

const appointments = [consultaA, consultaB, consultaC, eventoD, consultaNoShow, consultaConfirmed];

function byDay(rows: AppointmentRow[]) {
  const map = new Map<string, AppointmentRow[]>();
  map.set(DAY, rows);
  return map;
}

const PAINT: Record<string, string> = {
  active: "#dcfce7",
  completed: "#dbeafe",
  cancelled: "#fee2e2",
};

function expectTone(name: string, tone: string, classes: string[]) {
  const matches = screen.getAllByText(name);
  expect(matches.length).toBeGreaterThan(0);
  for (const match of matches) {
    const node = match.closest("[data-appointment-visual]");
    expect(node).toHaveAttribute("data-appointment-visual", tone);
    for (const className of classes) {
      expect(node).toHaveClass(className);
    }
    expect(node).toHaveStyle({ backgroundColor: PAINT[tone] });
    if (tone === "active" && name === "Evento D") {
      expect(node).toHaveAttribute("data-appointment-origin", "GOOGLE_EXTERNAL");
      expect(node).toHaveStyle({ borderStyle: "dashed" });
    }
  }
}

describe("Agenda — cores por status em dia/semana/mês", () => {
  it("DayView pinta A verde, B azul, C vermelho suave, D verde tracejado", () => {
    render(
      <DayView
        appointments={appointments}
        timeZone={TIME_ZONE}
        onSelect={() => undefined}
      />,
    );

    expectTone("Consulta A", "active", ["bg-green-100", "border-green-500", "text-green-900"]);
    expectTone("Consulta Confirmada", "active", ["bg-green-100"]);
    expectTone("Consulta B", "completed", ["bg-blue-100", "border-blue-500", "text-blue-900"]);
    expectTone("Consulta C", "cancelled", ["bg-red-100", "border-red-400", "text-red-800"]);
    expectTone("Consulta E", "cancelled", ["bg-red-100"]);
    expectTone("Evento D", "active", ["bg-green-100", "border-green-500", "text-green-900"]);
    expect(screen.getAllByText("Google externo").length).toBeGreaterThan(0);
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
    expectTone("Consulta E", "cancelled", ["bg-red-100"]);
    expectTone("Evento D", "active", ["bg-green-100"]);
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
    expectTone("Evento D", "active", ["bg-green-100", "border-green-500"]);
  });

  it("AppointmentCard scheduled online não fica verde só porque é Google/online", () => {
    render(<AppointmentCard appointment={consultaA} timeZone={TIME_ZONE} />);
    const card = screen.getByText("Consulta A").closest("[data-appointment-visual]");
    expect(card).toHaveAttribute("data-appointment-visual", "active");
    expect(card).toHaveClass("bg-green-100");
    expect(card).toHaveStyle({ backgroundColor: "#dcfce7" });
    expect(card).not.toHaveClass("bg-sage-light/80");
    expect(card).not.toHaveClass("bg-card");
  });

  it("AppointmentCard Google externo scheduled é verde, tracejado, sem Atender", () => {
    render(<AppointmentCard appointment={eventoD} timeZone={TIME_ZONE} isAdmin />);
    const card = screen.getByText("Evento D").closest("[data-appointment-visual]");
    expect(card).toHaveAttribute("data-appointment-visual", "active");
    expect(card).toHaveAttribute("data-appointment-origin", "GOOGLE_EXTERNAL");
    expect(card).toHaveStyle({ backgroundColor: "#dcfce7", borderStyle: "dashed" });
    expect(screen.getByText("Google externo")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Atender" })).not.toBeInTheDocument();
  });

  it("AppointmentDetailDrawer usa a mesma paleta por status", () => {
    const noop = () => undefined;
    for (const [row, tone, background] of [
      [consultaA, "active", "#dcfce7"],
      [consultaB, "completed", "#dbeafe"],
      [consultaC, "cancelled", "#fee2e2"],
      [eventoD, "active", "#dcfce7"],
      [consultaNoShow, "cancelled", "#fee2e2"],
    ] as const) {
      const { unmount } = render(
        <AppointmentDetailDrawer
          appointment={row}
          timeZone={TIME_ZONE}
          googleConnected={false}
          isAdmin
          onClose={noop}
          onEdit={noop}
          onRefresh={noop}
          onCancelled={noop}
        />,
      );
      const strip = document.querySelector("[data-appointment-visual]");
      expect(strip).toHaveAttribute("data-appointment-visual", tone);
      expect(strip).toHaveStyle({ backgroundColor: background });
      unmount();
    }
  });

  it("TodayTimeline (Agenda de Hoje) pinta A/B/C/D pela mesma função", () => {
    function asDay(row: AppointmentRow): MyDayAppointment {
      return {
        id: row.id,
        startsAt: row.starts_at,
        endsAt: row.ends_at,
        status: row.status,
        modality: row.modality,
        origin: row.origin,
        summarySnapshot: row.summary_snapshot,
        meetUrl: row.meet_url,
        meetStatus: row.meet_status,
        patientId: row.patient_id,
        patientPreferredName: row.summary_snapshot,
        patientPublicCode: null,
        patientPhone: null,
      };
    }

    render(
      <TodayTimeline
        appointments={appointments.map(asDay)}
        timeZone={TIME_ZONE}
        canStartSession={false}
      />,
    );

    expectTone("Consulta A", "active", ["bg-green-100"]);
    expectTone("Consulta B", "completed", ["bg-blue-100"]);
    expectTone("Consulta C", "cancelled", ["bg-red-100"]);
    expectTone("Consulta E", "cancelled", ["bg-red-100"]);
    expectTone("Evento D", "active", ["bg-green-100"]);
    expect(screen.getAllByText("Google externo").length).toBeGreaterThan(0);
  });
});

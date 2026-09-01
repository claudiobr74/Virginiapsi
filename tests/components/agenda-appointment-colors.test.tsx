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

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/features/sessions/components/start-session-button", () => ({
  StartSessionButton: () => null,
}));

vi.mock("@/features/calendar/link-patient-actions", () => ({
  searchPatientsForAppointmentLinkAction: vi.fn(async () => ({ patients: [] })),
  linkPatientAndStartSessionAction: vi.fn(),
}));

vi.mock("@/features/calendar/appointment-actions", () => ({
  cancelAppointmentAction: vi.fn(),
  updateAppointmentStatusAction: vi.fn(),
  deleteAppointmentAction: vi.fn(),
  retryGoogleSyncAction: vi.fn(),
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
const NOW = new Date("2026-08-18T12:00:00.000Z");

function stub(
  extras: Partial<AppointmentRow> &
    Pick<AppointmentRow, "id" | "status" | "origin" | "summary_snapshot">,
): AppointmentRow {
  return {
    organization_id: "22222222-2222-4222-8222-222222222222",
    patient_id: extras.origin === "GOOGLE_EXTERNAL" ? null : "33333333-3333-4333-8333-333333333333",
    starts_at: "2026-08-18T15:00:00.000Z",
    ends_at: "2026-08-18T16:00:00.000Z",
    modality: extras.modality ?? "online",
    managed_by_tesseli: extras.origin === "TESSELI",
    google_calendar_id: extras.origin === "GOOGLE_EXTERNAL" ? "primary" : null,
    google_event_id: extras.origin === "GOOGLE_EXTERNAL" ? "evt-d" : null,
    meet_url: null,
    meet_status: "none",
    google_color_id: null,
    cancelled_google_color_ids: [],
    unavailable_google_color_ids: [],
    google_deleted_at: null,
    sync_status: "synced",
    ...extras,
  };
}

const anaClaudia = stub({
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  status: "scheduled",
  origin: "TESSELI",
  summary_snapshot: "Ana Cláudia-1(c)",
  starts_at: "2026-08-18T15:00:00.000Z",
  ends_at: "2026-08-18T16:00:00.000Z",
});
const helio = stub({
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  status: "scheduled",
  origin: "TESSELI",
  summary_snapshot: "Helio (c)",
  modality: "in_person",
  starts_at: "2026-08-18T10:00:00.000Z",
  ends_at: "2026-08-18T11:00:00.000Z",
});
const cancelado = stub({
  id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  status: "cancelled",
  origin: "TESSELI",
  summary_snapshot: "Evento cancelado",
  starts_at: "2026-08-18T08:00:00.000Z",
  ends_at: "2026-08-18T09:00:00.000Z",
});
const eventoGoogle = stub({
  id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  status: "scheduled",
  origin: "GOOGLE_EXTERNAL",
  patient_id: null,
  managed_by_tesseli: false,
  summary_snapshot: "Livia-1(c) / Flávia-3",
  starts_at: "2026-08-18T17:00:00.000Z",
  ends_at: "2026-08-18T18:00:00.000Z",
});
const vinicius = stub({
  id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
  status: "scheduled",
  origin: "GOOGLE_EXTERNAL",
  summary_snapshot: "Vinicius-2(desmarcou)",
  starts_at: "2026-08-18T19:00:00.000Z",
  ends_at: "2026-08-18T20:00:00.000Z",
});
const giovanna = stub({
  id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
  status: "scheduled",
  origin: "TESSELI",
  summary_snapshot: "Giovanna (desmarcou)",
  starts_at: "2026-08-18T14:00:00.000Z",
  ends_at: "2026-08-18T15:00:00.000Z",
});

const appointments = [anaClaudia, helio, cancelado, eventoGoogle, vinicius, giovanna];

function byDay(rows: AppointmentRow[]) {
  const map = new Map<string, AppointmentRow[]>();
  map.set(DAY, rows);
  return map;
}

const PAINT = {
  active: "#34A853",
  completed: "#1A73E8",
  cancelled: "#D93025",
} as const;

function expectTone(name: string, tone: keyof typeof PAINT) {
  const matches = screen.getAllByText(name);
  expect(matches.length).toBeGreaterThan(0);
  for (const match of matches) {
    const node = match.closest("[data-appointment-visual]");
    expect(node).toHaveAttribute("data-appointment-visual", tone);
    expect(node).toHaveStyle({ backgroundColor: PAINT[tone], color: "#ffffff" });
    expect(node).not.toHaveStyle({ borderStyle: "dashed" });
  }
}

describe("Agenda V2 — cores sólidas em dia/semana/mês", () => {
  it("DayView pinta futuro verde, encerrado azul, desmarcou vermelho", () => {
    render(
      <DayView
        appointments={appointments}
        timeZone={TIME_ZONE}
        now={NOW}
        onSelect={() => undefined}
      />,
    );

    expectTone("Ana Cláudia-1(c)", "active");
    expectTone("Helio (c)", "completed");
    expectTone("Evento cancelado", "cancelled");
    expectTone("Livia-1(c) / Flávia-3", "active");
    expectTone("Vinicius-2(desmarcou)", "cancelled");
    expectTone("Giovanna (desmarcou)", "cancelled");
    expect(screen.getAllByText("Google").length).toBeGreaterThan(0);
    expect(screen.queryByText("Google externo")).not.toBeInTheDocument();
  });

  it("WeekView usa a mesma paleta", () => {
    render(
      <WeekView
        days={[DAY]}
        appointmentsByDay={byDay(appointments)}
        timeZone={TIME_ZONE}
        today={DAY}
        now={NOW}
        onSelect={() => undefined}
      />,
    );

    expectTone("Ana Cláudia-1(c)", "active");
    expectTone("Helio (c)", "completed");
    expectTone("Evento cancelado", "cancelled");
    expectTone("Vinicius-2(desmarcou)", "cancelled");
  });

  it("MonthView mostra pills sólidas", () => {
    render(
      <MonthView
        days={[DAY]}
        appointmentsByDay={byDay(appointments)}
        today={DAY}
        now={NOW}
        onSelectDay={() => undefined}
      />,
    );

    expectTone("Ana Cláudia-1(c)", "active");
    expectTone("Helio (c)", "completed");
    expectTone("Evento cancelado", "cancelled");
    expectTone("Livia-1(c) / Flávia-3", "active");
  });

  it("AppointmentCard Google futuro é verde sólido, badge Google, com Atender", () => {
    render(
      <AppointmentCard appointment={eventoGoogle} timeZone={TIME_ZONE} isAdmin now={NOW} />,
    );
    const card = screen.getByText("Livia-1(c) / Flávia-3").closest("[data-appointment-visual]");
    expect(card).toHaveAttribute("data-appointment-visual", "active");
    expect(card).toHaveAttribute("data-appointment-origin", "GOOGLE_EXTERNAL");
    expect(card).toHaveStyle({ backgroundColor: "#34A853" });
    expect(screen.getByText("Google")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Atender" })).toBeInTheDocument();
  });

  it("Isadora colorId 8 mostra INDISPONÍVEL vermelho, não Cancelado", () => {
    const isadora = stub({
      id: "12121212-1212-4121-8121-121212121212",
      status: "scheduled",
      origin: "GOOGLE_EXTERNAL",
      summary_snapshot: "Isadora? não pode",
      google_color_id: "8",
      unavailable_google_color_ids: ["8"],
      starts_at: "2026-08-18T18:00:00.000Z",
      ends_at: "2026-08-18T19:00:00.000Z",
    });
    render(<AppointmentCard appointment={isadora} timeZone={TIME_ZONE} isAdmin now={NOW} />);
    const card = screen.getByText("Isadora? não pode").closest("[data-appointment-visual]");
    expect(card).toHaveAttribute("data-appointment-visual", "unavailable");
    expect(card).toHaveStyle({ backgroundColor: "#D93025" });
    expect(screen.getByText("Indisponível")).toBeInTheDocument();
    expect(screen.queryByText("Cancelado")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Atender" })).not.toBeInTheDocument();
  });

  it("AppointmentDetailDrawer usa a mesma paleta e permite editar Google", () => {
    const noop = () => undefined;
    const { unmount } = render(
      <AppointmentDetailDrawer
        appointment={eventoGoogle}
        timeZone={TIME_ZONE}
        googleConnected
        isAdmin
        now={NOW}
        onClose={noop}
        onEdit={noop}
        onRefresh={noop}
        onCancelled={noop}
      />,
    );
    const strip = document.querySelector("[data-appointment-visual]");
    expect(strip).toHaveAttribute("data-appointment-visual", "active");
    expect(strip).toHaveStyle({ backgroundColor: "#34A853" });
    expect(screen.queryByText(/somente leitura/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Editar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Excluir" })).toBeInTheDocument();
    unmount();
  });

  it("TodayTimeline pinta pela mesma função", () => {
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
        googleColorId: row.google_color_id ?? null,
        cancelledGoogleColorIds: row.cancelled_google_color_ids ?? [],
        unavailableGoogleColorIds: row.unavailable_google_color_ids ?? [],
        googleDeletedAt: row.google_deleted_at ?? null,
      };
    }

    render(
      <TodayTimeline
        appointments={appointments.map(asDay)}
        timeZone={TIME_ZONE}
        canStartSession={false}
        now={NOW}
      />,
    );

    expectTone("Ana Cláudia-1(c)", "active");
    expectTone("Helio (c)", "completed");
    expectTone("Evento cancelado", "cancelled");
    expectTone("Vinicius-2(desmarcou)", "cancelled");
  });
});

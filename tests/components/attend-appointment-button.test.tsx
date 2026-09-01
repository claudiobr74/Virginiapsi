import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { linkPatientAndStartSessionAction } from "@/features/calendar/link-patient-actions";
import { AttendAppointmentButton } from "@/features/calendar/components/attend-appointment-button";
import { appointmentRowToAttendTarget } from "@/features/calendar/attend-target";
import type { AppointmentRow } from "@/features/calendar/contracts";
import { NextSessionCard } from "@/features/dashboard/components/next-session-card";
import { TodayTimeline } from "@/features/dashboard/components/today-timeline";
import type { MyDayAppointment } from "@/features/dashboard/contracts";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/features/dashboard/actions", () => ({
  confirmAppointmentFromMyDayAction: vi.fn(),
  markNoShowFromMyDayAction: vi.fn(),
}));

vi.mock("@/features/sessions/components/start-session-button", () => ({
  StartSessionButton: ({ label }: { label: string }) => (
    <button type="button">{label}</button>
  ),
}));

vi.mock("@/features/calendar/link-patient-actions", () => ({
  searchPatientsForAppointmentLinkAction: vi.fn(async () => ({
    patients: [
      {
        id: "33333333-3333-4333-8333-333333333333",
        preferredName: "Jessyca Ferreira",
        publicCode: "PAC-041",
        suggested: true,
      },
    ],
  })),
  linkPatientAndStartSessionAction: vi.fn(),
}));

const TIME_ZONE = "America/Sao_Paulo";
const NOW = new Date("2026-08-18T12:00:00.000Z");
const PATIENT = "33333333-3333-4333-8333-333333333333";

function row(
  extras: Partial<AppointmentRow> & Pick<AppointmentRow, "id" | "origin" | "summary_snapshot">,
): AppointmentRow {
  return {
    organization_id: "22222222-2222-4222-8222-222222222222",
    patient_id: extras.patient_id ?? null,
    starts_at: extras.starts_at ?? "2026-08-18T15:00:00.000Z",
    ends_at: extras.ends_at ?? "2026-08-18T16:00:00.000Z",
    status: extras.status ?? "scheduled",
    modality: "online",
    managed_by_tesseli: extras.origin === "TESSELI",
    google_calendar_id: extras.origin === "GOOGLE_EXTERNAL" ? "primary" : null,
    google_event_id: extras.origin === "GOOGLE_EXTERNAL" ? "evt-1" : null,
    meet_url: null,
    meet_status: "none",
    google_color_id: extras.google_color_id ?? null,
    cancelled_google_color_ids: [],
    unavailable_google_color_ids: extras.unavailable_google_color_ids ?? [],
    google_deleted_at: extras.google_deleted_at ?? null,
    sync_status: "synced",
    ...extras,
  };
}

function asDay(appointment: AppointmentRow): MyDayAppointment {
  return {
    id: appointment.id,
    startsAt: appointment.starts_at,
    endsAt: appointment.ends_at,
    status: appointment.status,
    modality: appointment.modality,
    origin: appointment.origin,
    summarySnapshot: appointment.summary_snapshot,
    meetUrl: appointment.meet_url,
    meetStatus: appointment.meet_status,
    patientId: appointment.patient_id,
    patientPreferredName: appointment.patient_id ? "Claudio" : null,
    patientPublicCode: appointment.patient_id ? "PAC-010" : null,
    patientPhone: null,
    googleColorId: appointment.google_color_id ?? null,
    unavailableGoogleColorIds: appointment.unavailable_google_color_ids ?? [],
    googleDeletedAt: appointment.google_deleted_at ?? null,
  };
}

const tesseliLinked = row({
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  origin: "TESSELI",
  summary_snapshot: "Claudio",
  patient_id: PATIENT,
});
const googleLinked = row({
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  origin: "GOOGLE_EXTERNAL",
  summary_snapshot: "Jessyca-1(c)",
  patient_id: PATIENT,
});
const googlePatientless = row({
  id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  origin: "GOOGLE_EXTERNAL",
  summary_snapshot: "Jessyca-1(c)",
  patient_id: null,
});
const googleCompleted = row({
  id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  origin: "GOOGLE_EXTERNAL",
  summary_snapshot: "Jessyca-1(c)",
  patient_id: null,
  starts_at: "2026-08-18T10:00:00.000Z",
  ends_at: "2026-08-18T11:00:00.000Z",
});
const cancelled = row({
  id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
  origin: "GOOGLE_EXTERNAL",
  summary_snapshot: "Giovanna (desmarcou)",
  patient_id: null,
});
const unavailable = row({
  id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
  origin: "GOOGLE_EXTERNAL",
  summary_snapshot: "Isadora? não pode",
  google_color_id: "8",
  unavailable_google_color_ids: ["8"],
});
const deleted = row({
  id: "12121212-1212-4121-8121-121212121212",
  origin: "GOOGLE_EXTERNAL",
  summary_snapshot: "Helio-1??? Julianna-1???",
  google_deleted_at: "2026-08-18T03:00:00.000Z",
});

describe("Agenda V2.4 — Atender", () => {
  it("Caso A: TESSELI ativo com paciente mostra Atender direto", () => {
    render(
      <AppointmentCard appointment={tesseliLinked} timeZone={TIME_ZONE} isAdmin now={NOW} />,
    );
    expect(screen.getByRole("button", { name: "Atender" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Vincular paciente" })).not.toBeInTheDocument();
  });

  it("Caso B: Google ativo com paciente mostra Atender direto", () => {
    render(
      <AppointmentCard appointment={googleLinked} timeZone={TIME_ZONE} isAdmin now={NOW} />,
    );
    expect(screen.getByRole("button", { name: "Atender" })).toBeInTheDocument();
  });

  it("Caso C: Google ativo sem paciente abre vinculação", async () => {
    const user = userEvent.setup();
    render(
      <AttendAppointmentButton
        appointment={appointmentRowToAttendTarget(googlePatientless)}
        timeZone={TIME_ZONE}
        canStartSession
        now={NOW}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Atender" }));
    expect(await screen.findByRole("heading", { name: "Vincular paciente" })).toBeInTheDocument();
    expect(screen.getByText("Jessyca-1(c)")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /Jessyca Ferreira/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Vincular e atender" })).toBeDisabled();
    expect(linkPatientAndStartSessionAction).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: /Jessyca Ferreira/ }));
    expect(screen.getByRole("button", { name: "Vincular e atender" })).toBeEnabled();
    expect(linkPatientAndStartSessionAction).not.toHaveBeenCalled();
  });

  it("Caso D: Google completed/azul mostra Atender", () => {
    render(
      <AppointmentCard appointment={googleCompleted} timeZone={TIME_ZONE} isAdmin now={NOW} />,
    );
    expect(screen.getByRole("button", { name: "Atender" })).toBeInTheDocument();
    expect(
      screen.getByText("Jessyca-1(c)").closest("[data-appointment-visual]"),
    ).toHaveAttribute("data-appointment-visual", "completed");
  });

  it("Caso E: cancelado não mostra Atender", () => {
    render(<AppointmentCard appointment={cancelled} timeZone={TIME_ZONE} isAdmin now={NOW} />);
    expect(screen.queryByRole("button", { name: "Atender" })).not.toBeInTheDocument();
  });

  it("Caso F: indisponível não mostra Atender", () => {
    render(
      <AppointmentCard appointment={unavailable} timeZone={TIME_ZONE} isAdmin now={NOW} />,
    );
    expect(screen.queryByRole("button", { name: "Atender" })).not.toBeInTheDocument();
  });

  it("Caso G: deleted não oferece Atender no botão central", () => {
    render(
      <AttendAppointmentButton
        appointment={appointmentRowToAttendTarget(deleted)}
        timeZone={TIME_ZONE}
        canStartSession
        now={NOW}
      />,
    );
    expect(screen.queryByRole("button", { name: "Atender" })).not.toBeInTheDocument();
  });

  it("Próxima sessão Google sem patientId mostra Atender", () => {
    render(
      <NextSessionCard
        appointment={asDay(googlePatientless)}
        timeZone={TIME_ZONE}
        canStartSession
        emptyDay={false}
        now={NOW}
      />,
    );
    expect(screen.getByText("Próxima sessão")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Atender" })).toBeInTheDocument();
  });

  it("Meu Dia timeline Google sem patientId mostra Atender", () => {
    render(
      <TodayTimeline
        appointments={[asDay(googlePatientless)]}
        timeZone={TIME_ZONE}
        canStartSession
        now={NOW}
      />,
    );
    expect(screen.getByRole("button", { name: "Atender" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirmar" })).not.toBeInTheDocument();
  });
});

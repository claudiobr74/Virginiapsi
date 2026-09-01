import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NextSessionCard } from "@/features/dashboard/components/next-session-card";
import { SessionActions } from "@/features/dashboard/components/session-actions";
import { TodayTimeline } from "@/features/dashboard/components/today-timeline";
import type { MyDayAppointment } from "@/features/dashboard/contracts";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/features/dashboard/actions", () => ({
  confirmAppointmentFromMyDayAction: vi.fn(),
  markNoShowFromMyDayAction: vi.fn(),
}));

vi.mock("@/features/sessions/components/start-session-button", () => ({
  StartSessionButton: ({ label }: { label: string }) => <button type="button">{label}</button>,
}));

vi.mock("@/features/calendar/link-patient-actions", () => ({
  searchPatientsForAppointmentLinkAction: vi.fn(async () => ({ patients: [] })),
  linkPatientAndStartSessionAction: vi.fn(),
}));

const TIME_ZONE = "America/Sao_Paulo";
const NOW = new Date("2026-08-18T12:00:00.000Z");

function googleExternal(): MyDayAppointment {
  return {
    id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    startsAt: "2026-08-18T15:00:00.000Z",
    endsAt: "2026-08-18T16:00:00.000Z",
    status: "scheduled",
    modality: "online",
    origin: "GOOGLE_EXTERNAL",
    summarySnapshot: "Evento D",
    meetUrl: null,
    meetStatus: "none",
    patientId: null,
    patientPreferredName: null,
    patientPublicCode: null,
    patientPhone: null,
  };
}

function tesseliManaged(): MyDayAppointment {
  return {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    startsAt: "2026-08-18T15:00:00.000Z",
    endsAt: "2026-08-18T16:00:00.000Z",
    status: "scheduled",
    modality: "online",
    origin: "TESSELI",
    summarySnapshot: "Consulta B",
    meetUrl: null,
    meetStatus: "none",
    patientId: "33333333-3333-4333-8333-333333333333",
    patientPreferredName: "Beatriz",
    patientPublicCode: "PAC-001",
    patientPhone: "+5511988887777",
  };
}

describe("Meu Dia — Google externo sem paciente", () => {
  it("aparece na timeline verde sólida, com badge Google e Atender", () => {
    render(
      <TodayTimeline
        appointments={[googleExternal()]}
        timeZone={TIME_ZONE}
        canStartSession
        now={NOW}
      />,
    );

    const row = screen.getByText("Evento D").closest("[data-appointment-visual]");
    expect(row).toHaveAttribute("data-appointment-visual", "active");
    expect(row).toHaveStyle({ backgroundColor: "#34A853" });
    expect(screen.getByText("Google")).toBeInTheDocument();
    expect(screen.queryByText("Google externo")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Atender" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirmar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /WhatsApp/ })).not.toBeInTheDocument();
  });

  it("aparece no próximo compromisso com Atender e sem Confirmar/WhatsApp", () => {
    render(
      <NextSessionCard
        appointment={googleExternal()}
        timeZone={TIME_ZONE}
        canStartSession
        emptyDay={false}
        now={NOW}
      />,
    );

    const card = screen.getByRole("heading", { name: "Evento D" }).closest("[data-appointment-visual]");
    expect(card).toHaveAttribute("data-appointment-origin", "GOOGLE_EXTERNAL");
    expect(card).toHaveStyle({ backgroundColor: "#34A853" });
    expect(screen.getByText("Google")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Atender" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirmar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /WhatsApp/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Marcar Falta" })).not.toBeInTheDocument();
  });

  it("SessionActions TESSELI com paciente oferece Confirmar, WhatsApp e Atender", () => {
    render(
      <SessionActions appointment={tesseliManaged()} timeZone={TIME_ZONE} canStartSession />,
    );
    expect(screen.getByRole("button", { name: "Confirmar" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Lembrete WhatsApp" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Atender" })).toBeInTheDocument();
  });
});

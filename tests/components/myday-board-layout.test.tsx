import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MyDayBoard } from "@/features/dashboard/components/my-day-board";
import { PHASE_AVAILABILITY, type MyDaySnapshot } from "@/features/dashboard/contracts";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/features/dashboard/actions", () => ({
  confirmAppointmentFromMyDayAction: vi.fn(),
  markNoShowFromMyDayAction: vi.fn(),
  completeTaskAction: vi.fn(),
  createTaskAction: vi.fn(),
  deleteTaskAction: vi.fn(),
}));

vi.mock("@/features/sessions/components/start-session-button", () => ({
  StartSessionButton: ({ label }: { label: string }) => (
    <button type="button">{label}</button>
  ),
}));

vi.mock("@/features/calendar/link-patient-actions", () => ({
  searchPatientsForAppointmentLinkAction: vi.fn(async () => ({ patients: [] })),
  linkPatientAndStartSessionAction: vi.fn(),
}));

const appointment = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  startsAt: "2026-08-18T15:00:00.000Z",
  endsAt: "2026-08-18T16:00:00.000Z",
  status: "scheduled" as const,
  modality: "online" as const,
  origin: "TESSELI" as const,
  summarySnapshot: "Consulta B",
  meetUrl: null,
  meetStatus: "none" as const,
  patientId: "33333333-3333-4333-8333-333333333333",
  patientPreferredName: "Beatriz",
  patientPublicCode: "PAC-001",
  patientPhone: "+5511988887777",
};

function snapshot(): MyDaySnapshot {
  return {
    greeting: { prefix: "Bom dia", professionalName: "Ana", quote: null },
    professionalPhotoUrl: null,
    timezone: "America/Sao_Paulo",
    quoteCivilDate: "2026-08-18",
    roleLabel: "Psicóloga",
    clinicName: "Consultório Serena",
    canStartSession: true,
    nextSession: appointment,
    timeline: [appointment],
    sessionsToFinalize: [],
    financialPending: [],
    recentDocuments: [],
    tasks: [],
    phases: PHASE_AVAILABILITY,
    metrics: {
      sessionsThisWeek: 1,
      sessionsToday: 1,
      activePatients: 1,
      clinicalPendencies: 0,
      monthReceiptsCents: 0,
    },
  };
}

describe("MyDayBoard — hierarquia visual", () => {
  it("coloca Agenda de Hoje na coluna principal, após Próxima sessão, e os painéis na lateral", () => {
    render(<MyDayBoard snapshot={snapshot()} />);

    const primary = document.querySelector("[data-myday-region='primary']");
    const secondary = document.querySelector("[data-myday-region='secondary']");
    expect(primary).toBeTruthy();
    expect(secondary).toBeTruthy();

    expect(primary).toHaveTextContent("Próxima sessão");
    expect(primary).toContainElement(screen.getByRole("heading", { name: "Agenda de Hoje" }));
    expect(secondary).not.toContainElement(
      screen.getByRole("heading", { name: "Agenda de Hoje" }),
    );

    const secondaryHeadings = Array.from(
      secondary!.querySelectorAll("h2"),
    ).map((node) => node.textContent);
    expect(secondaryHeadings).toEqual([
      "Salas Google Meet",
      "Sessões a Finalizar",
      "Pendências Financeiras",
      "Minhas Tarefas",
      "Documentos Gerados",
    ]);

    const headings = screen.getAllByRole("heading", { level: 2 }).map((node) => node.textContent);
    expect(headings[0]).toBe("Beatriz");
    expect(headings.slice(1)).toEqual([
      "Agenda de Hoje",
      "Salas Google Meet",
      "Sessões a Finalizar",
      "Pendências Financeiras",
      "Minhas Tarefas",
      "Documentos Gerados",
    ]);
  });
});

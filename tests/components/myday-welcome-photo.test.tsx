import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MyDayWelcome } from "@/features/dashboard/components/my-day-welcome";
import { PHASE_AVAILABILITY, type MyDaySnapshot } from "@/features/dashboard/contracts";

function snapshot(photoUrl: string | null): MyDaySnapshot {
  return {
    greeting: { prefix: "Olá", professionalName: "Ana Serena", quote: null },
    professionalPhotoUrl: photoUrl,
    timezone: "America/Sao_Paulo",
    roleLabel: "Psicóloga",
    clinicName: "Consultório Serena",
    canStartSession: true,
    nextSession: null,
    timeline: [],
    sessionsToFinalize: [],
    financialPending: [],
    recentDocuments: [],
    tasks: [],
    phases: PHASE_AVAILABILITY,
    metrics: {
      sessionsThisWeek: 0,
      sessionsToday: 0,
      activePatients: 0,
      clinicalPendencies: 0,
      monthReceiptsCents: 0,
    },
  };
}

describe("MyDayWelcome — foto profissional", () => {
  it("mostra a foto ao lado do nome quando há URL assinada", () => {
    render(<MyDayWelcome snapshot={snapshot("https://signed.example/photo")} />);
    expect(screen.getByRole("heading", { name: "Olá, Ana Serena" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Foto de Ana Serena" })).toHaveAttribute(
      "src",
      "https://signed.example/photo",
    );
  });

  it("não inventa uma imagem quando não há foto", () => {
    render(<MyDayWelcome snapshot={snapshot(null)} />);
    expect(screen.getByRole("heading", { name: "Olá, Ana Serena" })).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Foto de Ana Serena" })).not.toBeInTheDocument();
  });
});

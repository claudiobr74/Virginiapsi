import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PatientDirectoryTable } from "@/features/patients/components/patient-directory-table";
import type { PatientDirectoryRow, PatientRow } from "@/features/patients/contracts";

function patient(overrides: Partial<PatientRow> = {}): PatientRow {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    organization_id: "11111111-1111-4111-8111-111111111111",
    public_code: "PAC-001",
    preferred_name: "Beatriz",
    full_name: "Beatriz Lima",
    birth_date: "1990-05-10",
    cpf: null,
    phone: null,
    email: null,
    responsibles: [],
    modality: "in_person",
    status: "active",
    default_session_value: null,
    photo_path: null,
    responsible_psychologist_user_id: null,
    elimination_status: "active",
    elimination_requested_at: null,
    elimination_completed_at: null,
    elimination_retained_reason: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function row(overrides: Partial<PatientDirectoryRow> = {}): PatientDirectoryRow {
  return {
    patient: patient(),
    photoUrl: null,
    lastSessionAt: null,
    nextSessionAt: null,
    pendingClinical: 0,
    ...overrides,
  };
}

describe("PatientDirectoryTable", () => {
  it("passa a URL assinada ao avatar e não o photo_path", () => {
    render(
      <PatientDirectoryTable
        rows={[
          row({
            photoUrl: "https://signed.example/beatriz.jpg",
            lastSessionAt: "2026-08-20T15:00:00.000Z",
            nextSessionAt: "2026-09-10T15:00:00.000Z",
          }),
        ]}
        timeZone="America/Sao_Paulo"
      />,
    );
    const img = screen.getByRole("img", { name: "Foto de Beatriz" });
    expect(img).toHaveAttribute("src", "https://signed.example/beatriz.jpg");
    expect(img.getAttribute("src")).not.toContain("photo_path");
    expect(screen.queryByText("—")).toBeNull();
  });

  it("mostra a inicial e travessão quando não há foto nem sessões", () => {
    render(
      <PatientDirectoryTable rows={[row()]} timeZone="America/Sao_Paulo" />,
    );
    expect(screen.getByText("B")).toBeTruthy();
    expect(screen.queryByRole("img", { name: "Foto de Beatriz" })).toBeNull();
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });
});

import type { Metadata } from "next";
import { PatientForm } from "@/features/patients/components/patient-form";
import { listAssignablePsychologists } from "@/features/organizations/queries";
import { isPsychologistAdmin, isSecretary } from "@/features/organizations/roles";
import { requireOrgContext } from "@/lib/auth/require-org-context";

export const metadata: Metadata = { title: "Cadastrar Paciente — VirgíniaPsi" };

function safeAppReturnTo(value: string | undefined): string | null {
  if (!value) {
    return null;
  }
  if (value !== "/app" && !value.startsWith("/app/")) {
    return null;
  }
  if (value.includes("://") || value.startsWith("//") || value.includes("\\")) {
    return null;
  }
  return value;
}

export default async function NewPatientPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const { organizationId, role } = await requireOrgContext();
  const params = await searchParams;
  const canAssign = isPsychologistAdmin(role) || isSecretary(role);
  const assignablePsychologists = canAssign
    ? await listAssignablePsychologists(organizationId)
    : [];

  return (
    <PatientForm
      canAssignResponsible={canAssign}
      assignablePsychologists={assignablePsychologists}
      afterCreateHref={safeAppReturnTo(params.returnTo)}
    />
  );
}

import type { Metadata } from "next";
import { PatientForm } from "@/features/patients/components/patient-form";
import { listAssignablePsychologists } from "@/features/organizations/queries";
import { isPsychologistAdmin, isSecretary } from "@/features/organizations/roles";
import { requireOrgContext } from "@/lib/auth/require-org-context";

export const metadata: Metadata = { title: "Cadastrar Paciente — VirgíniaPsi" };

export default async function NewPatientPage() {
  const { organizationId, role } = await requireOrgContext();
  const canAssign = isPsychologistAdmin(role) || isSecretary(role);
  const assignablePsychologists = canAssign
    ? await listAssignablePsychologists(organizationId)
    : [];

  return (
    <PatientForm
      canAssignResponsible={canAssign}
      assignablePsychologists={assignablePsychologists}
    />
  );
}

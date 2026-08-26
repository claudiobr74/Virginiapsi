import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { listPatientConsents } from "@/features/consents/queries";
import { listAssignablePsychologists } from "@/features/organizations/queries";
import { isPsychologistAdmin, isSecretary } from "@/features/organizations/roles";
import { PatientForm } from "@/features/patients/components/patient-form";
import { getPatient, getPatientPortraitUrl } from "@/features/patients/queries";
import { requireOrgContext } from "@/lib/auth/require-org-context";

export const metadata: Metadata = { title: "Editar paciente — VirgíniaPsi" };

export default async function EditPatientPage({
  params,
}: PageProps<"/app/patients/[patientId]/edit">) {
  const { patientId } = await params;
  const { organizationId, role } = await requireOrgContext();

  const patient = await getPatient(organizationId, patientId);
  if (!patient) {
    notFound();
  }

  let consents: Awaited<ReturnType<typeof listPatientConsents>> = [];
  try {
    consents = await listPatientConsents(organizationId, patient.id);
  } catch {
    consents = [];
  }

  const photoUrl = await getPatientPortraitUrl(patient.photo_path);
  const canAssign = isPsychologistAdmin(role) || isSecretary(role);
  const assignablePsychologists = canAssign
    ? await listAssignablePsychologists(organizationId)
    : [];

  return (
    <PatientForm
      patient={patient}
      photoUrl={photoUrl}
      terms={{
        isAdmin: isPsychologistAdmin(role),
        consents,
      }}
      canAssignResponsible={canAssign}
      assignablePsychologists={assignablePsychologists}
    />
  );
}

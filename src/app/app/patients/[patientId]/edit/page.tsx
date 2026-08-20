import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PatientForm } from "@/features/patients/components/patient-form";
import { getPatient } from "@/features/patients/queries";
import { requireOrgContext } from "@/lib/auth/require-org-context";

export const metadata: Metadata = { title: "Editar paciente — SerenaPsi" };

export default async function EditPatientPage({
  params,
}: PageProps<"/app/patients/[patientId]/edit">) {
  const { patientId } = await params;
  const { organizationId } = await requireOrgContext();

  const patient = await getPatient(organizationId, patientId);
  if (!patient) {
    notFound();
  }

  return <PatientForm patient={patient} />;
}

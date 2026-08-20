import type { Metadata } from "next";
import { PatientForm } from "@/features/patients/components/patient-form";
import { requireOrgContext } from "@/lib/auth/require-org-context";

export const metadata: Metadata = { title: "Novo paciente — Tesseli" };

export default async function NewPatientPage() {
  await requireOrgContext();
  return <PatientForm />;
}

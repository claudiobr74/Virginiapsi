"use server";

import { listPatients } from "@/features/patients/queries";
import { requireOrgContext } from "@/lib/auth/require-org-context";

export async function searchPatientsCommand(query: string): Promise<
  Array<{ id: string; name: string; code: string; href: string }>
> {
  const trimmed = query.trim();
  if (trimmed.length < 2) {
    return [];
  }

  const { organizationId } = await requireOrgContext();
  const patients = await listPatients(organizationId, { search: trimmed });
  return patients.slice(0, 8).map((patient) => ({
    id: patient.id,
    name: patient.preferred_name,
    code: patient.public_code,
    href: `/app/patients/${patient.id}`,
  }));
}

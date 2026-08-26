import "server-only";

import type { DocumentVariables } from "@/lib/documents/render-template";
import { getPatient } from "@/features/patients/queries";
import { getShellSettings } from "@/features/organizations/queries";

/**
 * Builds the flat dot-path variable map a template placeholder resolves
 * against. Only ever reads what the caller is already authorized to see —
 * this never becomes a way to leak clinical fields into an administrative
 * document, since callers only ever pass patientId for documents that are
 * already scoped to that patient.
 */
export async function buildDocumentVariables(
  organizationId: string,
  patientId?: string | null,
): Promise<DocumentVariables> {
  const variables: DocumentVariables = {
    "date.today": new Date().toLocaleDateString("pt-BR"),
  };

  const settings = await getShellSettings(organizationId);
  if (settings?.professional_name) {
    variables["professional.name"] = settings.professional_name;
  }
  if (settings?.organization_name) {
    variables["organization.name"] = settings.organization_name;
  }

  if (patientId) {
    const patient = await getPatient(organizationId, patientId);
    if (patient) {
      variables["patient.full_name"] = patient.full_name;
      variables["patient.preferred_name"] = patient.preferred_name;
      variables["patient.public_code"] = patient.public_code;
      if (patient.birth_date) {
        variables["patient.birth_date"] = new Date(
          `${patient.birth_date}T00:00:00`,
        ).toLocaleDateString("pt-BR");
      }
    }
  }

  return variables;
}

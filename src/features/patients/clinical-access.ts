import "server-only";

import type { OrganizationRole } from "@/features/organizations/contracts";
import { canAccessPatientClinical } from "@/features/organizations/roles";
import { getPatient } from "@/features/patients/queries";

export async function hasPatientClinicalAccess(input: {
  organizationId: string;
  role: OrganizationRole;
  userId: string;
  patientId: string;
}): Promise<boolean> {
  const patient = await getPatient(input.organizationId, input.patientId);
  if (!patient) {
    return false;
  }
  return canAccessPatientClinical({
    role: input.role,
    userId: input.userId,
    responsiblePsychologistUserId: patient.responsible_psychologist_user_id,
  });
}

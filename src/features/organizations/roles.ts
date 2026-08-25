import type { OrganizationRole } from "@/features/organizations/contracts";

export function isPsychologistAdmin(role: OrganizationRole): boolean {
  return role === "psychologist_admin";
}

export function isClinicalPractitioner(role: OrganizationRole): boolean {
  return role === "psychologist_admin" || role === "psychologist";
}

export function isSecretary(role: OrganizationRole): boolean {
  return role === "secretary";
}

export function canAccessPatientClinical(input: {
  role: OrganizationRole;
  userId: string;
  responsiblePsychologistUserId: string | null;
}): boolean {
  return (
    isClinicalPractitioner(input.role) &&
    input.responsiblePsychologistUserId === input.userId
  );
}

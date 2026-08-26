import type { OrganizationRole } from "@/features/organizations/contracts";

export const ROLE_LABELS: Record<OrganizationRole, string> = {
  psychologist_admin: "Administradora",
  psychologist: "Psicóloga clínica",
  secretary: "Secretaria",
};

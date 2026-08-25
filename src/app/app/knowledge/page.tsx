import { KnowledgeConsole } from "@/features/knowledge/components/knowledge-client";
import { listCollections, listSources } from "@/features/knowledge/queries";
import { listPatients } from "@/features/patients/queries";
import { RestrictedAccess } from "@/features/shell/restricted-access";
import { requireOrgContext } from "@/lib/auth/require-org-context";

export const metadata = { title: "Conhecimento — VirgíniaPsi" };

export default async function KnowledgePage() {
  const { organizationId, role } = await requireOrgContext();

  // "knowledge clinical" is psychologist_admin-only end to end
  // (docs/05-security-rbac-rls.md) — the secretary never even attempts
  // these queries.
  if (role !== "psychologist_admin") {
    return <RestrictedAccess sectionLabel="o Conhecimento clínico" />;
  }

  const [collections, sources, patients] = await Promise.all([
    listCollections(organizationId),
    listSources(organizationId),
    listPatients(organizationId, { status: "active" }),
  ]);

  return (
    <KnowledgeConsole
      collections={collections}
      sources={sources}
      patients={patients.map((patient) => ({
        id: patient.id,
        preferred_name: patient.preferred_name,
      }))}
    />
  );
}

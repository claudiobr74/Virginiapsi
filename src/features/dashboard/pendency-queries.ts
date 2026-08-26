import "server-only";

import { listSessionsToFinalize, listOpenTasks } from "@/features/dashboard/queries";
import type { PendencyItem } from "@/features/dashboard/pendencies";
import { listDocuments } from "@/features/documents/queries";
import {
  buildChargeViews,
  getFinanceAccess,
  listCharges,
  listPayments,
} from "@/features/finance/queries";
import { formatBRL } from "@/lib/finance/money";
import { listPatients } from "@/features/patients/queries";
import type { OrganizationRole } from "@/features/organizations/contracts";
import { isClinicalPractitioner } from "@/features/organizations/roles";
import { CONSENT_TYPE_LABELS, type ConsentType } from "@/features/consents/contracts";
import { createSupabaseServerClient } from "@/lib/supabase/server";

interface ConsentJoinRow {
  id: string;
  type: string;
  title: string;
  status: string;
  created_at: string;
  patient_id: string;
  patients:
    | { preferred_name: string; public_code: string }
    | { preferred_name: string; public_code: string }[]
    | null;
}

async function listPendingConsents(organizationId: string): Promise<PendencyItem[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("consents")
    .select("id, type, title, status, created_at, patient_id, patients(preferred_name, public_code)")
    .eq("organization_id", organizationId)
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(50);

  if (error || !data) {
    return [];
  }

  return (data as ConsentJoinRow[]).flatMap((row) => {
    const patient = Array.isArray(row.patients) ? row.patients[0] : row.patients;
    const name = patient?.preferred_name ?? "Paciente";
    const code = patient?.public_code ?? "";
    const typeLabel =
      CONSENT_TYPE_LABELS[row.type as ConsentType] ?? row.title;
    return [
      {
        id: `consent-${row.id}`,
        kind: "consent" as const,
        priority: "medium" as const,
        title: `Consentimento pendente — ${typeLabel}`,
        subtitle: code ? `${name} • ${code}` : name,
        href: `/app/patients/${row.patient_id}?tab=consents`,
        actionLabel: "Abrir",
        createdAt: row.created_at,
      },
    ];
  });
}

export async function listPendencies(
  organizationId: string,
  role: OrganizationRole,
): Promise<PendencyItem[]> {
  const [sessions, tasks, documents, access, patients] = await Promise.all([
    isClinicalPractitioner(role)
      ? listSessionsToFinalize(organizationId)
      : Promise.resolve([]),
    listOpenTasks(organizationId),
    listDocuments(organizationId),
    getFinanceAccess(organizationId, role),
    listPatients(organizationId),
  ]);

  const items: PendencyItem[] = [];

  for (const session of sessions) {
    items.push({
      id: `session-${session.id}`,
      kind: "clinical_record",
      priority: "high",
      title: "Preencher registro clínico pendente",
      subtitle: [session.patientPreferredName, session.patientPublicCode]
        .filter(Boolean)
        .join(" • ") || "Sessão clínica",
      href: `/session/${session.id}`,
      actionLabel: "Finalizar",
      createdAt: session.startedAt ?? session.createdAt,
    });
  }

  for (const document of documents.filter((row) => row.status === "draft")) {
    items.push({
      id: `document-${document.id}`,
      kind: "document",
      priority: "medium",
      title: `Concluir documento em rascunho — ${document.title}`,
      subtitle: "Rascunho aguardando emissão",
      href: `/app/documents/${document.id}`,
      actionLabel: "Abrir",
      createdAt: document.created_at,
    });
  }

  if (access !== "none") {
    const [charges, payments] = await Promise.all([
      listCharges(organizationId),
      listPayments(organizationId),
    ]);
    const names = new Map(patients.map((patient) => [patient.id, patient.preferred_name]));
    const overdue = buildChargeViews(charges, payments, names).filter((charge) =>
      ["overdue", "pending", "partially_paid"].includes(charge.row.status),
    );
    for (const charge of overdue) {
      items.push({
        id: `charge-${charge.row.id}`,
        kind: "payment",
        priority: charge.row.status === "overdue" ? "high" : "medium",
        title: `Faturamento pendente — ${formatBRL(charge.remainingCents)}`,
        subtitle: charge.patientName ?? "Sem paciente",
        href: "/app/finance",
        actionLabel: "Faturar",
        createdAt: charge.row.due_date ?? charge.row.created_at,
      });
    }
  }

  if (isClinicalPractitioner(role)) {
    items.push(...(await listPendingConsents(organizationId)));
  }

  for (const task of tasks) {
    items.push({
      id: `task-${task.id}`,
      kind: "task",
      priority: "low",
      title: task.title,
      subtitle: task.notes?.trim() || "Tarefa operacional",
      href: "/app",
      actionLabel: "Abrir",
      createdAt: task.due_at ?? task.created_at,
    });
  }

  return items.sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
}

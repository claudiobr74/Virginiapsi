import "server-only";

import { getPatient, getPatientClinicalProfile } from "@/features/patients/queries";
import {
  getSessionDpep,
  getSessionWorkingNotes,
  listPatientSessions,
} from "@/features/sessions/queries";
import {
  buildApplyToCaseMinimizedContext,
  formatApplyToCasePreview,
  type ApplyToCaseBuiltContext,
  type ApplyToCaseSelection,
} from "@/features/knowledge/apply-to-case-context";
import { MODALITY_LABELS } from "@/features/patients/contracts";

function summarizeDpep(dpep: {
  demand: string | null;
  procedures: string | null;
  evolution: string | null;
  plan: string | null;
} | null): string {
  if (!dpep) return "";
  return [
    dpep.demand ? `Demanda: ${dpep.demand}` : null,
    dpep.procedures ? `Procedimentos: ${dpep.procedures}` : null,
    dpep.evolution ? `Evolução: ${dpep.evolution}` : null,
    dpep.plan ? `Plano: ${dpep.plan}` : null,
  ]
    .filter(Boolean)
    .join(" | ");
}

export async function loadApplyToCaseBuiltContext(input: {
  organizationId: string;
  patientId: string;
  selection: ApplyToCaseSelection;
  additionalNotes?: string;
}): Promise<ApplyToCaseBuiltContext | { error: string }> {
  const patient = await getPatient(input.organizationId, input.patientId);
  if (!patient) {
    return { error: "Paciente não encontrado." };
  }

  const [profile, sessions] = await Promise.all([
    getPatientClinicalProfile(patient.id),
    listPatientSessions(input.organizationId, patient.id),
  ]);

  const recent = sessions.slice(0, 3);
  const dpepRows = await Promise.all(recent.map((session) => getSessionDpep(session.id)));
  const latestNotes = recent[0] ? await getSessionWorkingNotes(recent[0].id) : null;

  const identifiers = [
    patient.full_name,
    patient.preferred_name,
    patient.email ?? "",
    patient.phone ?? "",
    patient.cpf ?? "",
  ];

  return buildApplyToCaseMinimizedContext(input.selection, {
    modality: MODALITY_LABELS[patient.modality] ?? patient.modality,
    formulation: latestNotes?.formulation ?? profile?.schemas ?? profile?.core_beliefs,
    therapyGoals: profile?.therapy_goals,
    lastSessionSummary: summarizeDpep(dpepRows[0] ?? null),
    lastThreeSessionsSummary: dpepRows
      .map((row, index) => {
        const text = summarizeDpep(row);
        return text ? `Sessão ${index + 1}: ${text}` : null;
      })
      .filter(Boolean)
      .join(" "),
    dpepSummary: summarizeDpep(dpepRows[0] ?? null),
    additionalNotes: input.additionalNotes,
    identifiers,
  });
}

export function applyToCasePreviewText(built: ApplyToCaseBuiltContext): string {
  return formatApplyToCasePreview(built);
}

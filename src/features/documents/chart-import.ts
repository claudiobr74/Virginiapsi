import "server-only";

import { getPatient, getPatientClinicalProfile } from "@/features/patients/queries";
import {
  getSessionDpep,
  getSessionWorkingNotes,
  listPatientSessions,
} from "@/features/sessions/queries";

export interface DocumentChartImportSelection {
  formulation?: boolean;
  therapyGoals?: boolean;
  lastSession?: boolean;
  lastThreeSessions?: boolean;
  dpep?: boolean;
  additionalNotes?: boolean;
}

function clip(value: string, max = 480): string {
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1).trimEnd()}…`;
}

function redact(text: string, identifiers: string[]): string {
  let result = text;
  const unique = [...new Set(identifiers.map((item) => item.trim()).filter((item) => item.length >= 3))];
  unique.sort((a, b) => b.length - a.length);
  for (const identifier of unique) {
    result = result.split(identifier).join("[redigido]");
  }
  return result;
}

export async function loadDocumentChartContext(input: {
  organizationId: string;
  patientId: string;
  selection: DocumentChartImportSelection;
}): Promise<{ minimizedCaseContext: string } | { error: string }> {
  const selected =
    input.selection.formulation ||
    input.selection.therapyGoals ||
    input.selection.lastSession ||
    input.selection.lastThreeSessions ||
    input.selection.dpep ||
    input.selection.additionalNotes;
  if (!selected) {
    return { minimizedCaseContext: "" };
  }

  const patient = await getPatient(input.organizationId, input.patientId);
  if (!patient) {
    return { error: "Paciente não encontrado." };
  }
  const identifiers = [patient.full_name, patient.preferred_name, patient.cpf ?? "", patient.email ?? ""].filter(
    Boolean,
  );
  const parts: string[] = [];
  parts.push(`Modalidade: ${patient.modality ?? "não informada"}.`);

  if (input.selection.therapyGoals) {
    const profile = await getPatientClinicalProfile(input.patientId);
    const goals = redact(profile?.therapy_goals ?? "", identifiers);
    parts.push(`Objetivo principal: ${goals ? clip(goals) : "(não informado)"}`);
  }

  const sessions = await listPatientSessions(input.organizationId, input.patientId);
  const finalized = sessions.filter((session) => session.status === "finalized");
  const recent = finalized.slice(0, input.selection.lastThreeSessions ? 3 : 1);

  if (input.selection.formulation) {
    const notes = recent[0] ? await getSessionWorkingNotes(recent[0].id) : null;
    const formulation = redact(notes?.formulation ?? "", identifiers);
    parts.push(`Formulação resumida: ${formulation ? clip(formulation) : "(não informada)"}`);
  }

  if (input.selection.lastThreeSessions || input.selection.lastSession) {
    const summaries: string[] = [];
    const window = input.selection.lastThreeSessions ? recent : recent.slice(0, 1);
    for (const session of window) {
      const [notes, dpep] = await Promise.all([
        getSessionWorkingNotes(session.id),
        getSessionDpep(session.id),
      ]);
      const chunk = [notes?.working_observations, dpep?.evolution].filter(Boolean).join(" ");
      if (chunk) summaries.push(redact(chunk, identifiers));
    }
    const joined = summaries.join(" ");
    parts.push(
      input.selection.lastThreeSessions
        ? `Resumo clínico (últimas 3 sessões): ${joined ? clip(joined, 900) : "(não informado)"}`
        : `Resumo clínico selecionado: ${joined ? clip(joined) : "(não informado)"}`,
    );
  }

  if (input.selection.dpep) {
    const dpep = recent[0] ? await getSessionDpep(recent[0].id) : null;
    const text = [dpep?.demand, dpep?.procedures, dpep?.evolution, dpep?.plan]
      .filter(Boolean)
      .join(" ");
    const cleaned = redact(text, identifiers);
    parts.push(`DPEP selecionado: ${cleaned ? clip(cleaned, 900) : "(não informado)"}`);
  }

  if (input.selection.additionalNotes) {
    const profile = await getPatientClinicalProfile(input.patientId);
    const notes = redact(profile?.general_clinical_notes ?? "", identifiers);
    if (notes) parts.push(`Observações adicionais: ${clip(notes)}`);
  }

  return { minimizedCaseContext: parts.join("\n") };
}

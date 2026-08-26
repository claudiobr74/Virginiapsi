import type { ConsentState } from "@/features/consents/contracts";
import { packContext } from "@/lib/ai/context-packer";

// Exact shapes from docs/16-runtime-ai-data-contracts.md. These are
// constructed server-side only, from authorized/minimized data — never
// passed through from client input verbatim.

export interface ClinicalContextDescriptor {
  ageGroup?: "child" | "adolescent" | "adult" | "older_adult";
  modality?: "individual" | "couple" | "family" | "group";
  selectedFrameworks?: (
    | "cbt"
    | "schema"
    | "act_contextual"
    | "dbt"
    | "psychodynamic"
    | "humanistic_existential"
    | "systemic"
    | "interpersonal_attachment_mentalization"
    | "behavioral_functional"
  )[];
  relevantContext?: string[];
  patientGoals?: string[];
  patientPreferences?: string[];
}

export interface PatientRef {
  displayLabel: string;
  ageGroup?: ClinicalContextDescriptor["ageGroup"];
}

export interface TranscriptQuality {
  isPartial: boolean;
  confidenceAvailable?: boolean;
  knownAmbiguities?: string[];
}

export interface SessionLiveInput {
  organizationId: string;
  patientRef: PatientRef;
  sessionId: string;
  consentState: ConsentState;
  clinicalContext?: ClinicalContextDescriptor;
  transcriptWindow: string;
  transcriptQuality?: TranscriptQuality;
  clinicianNotes?: string;
  therapeuticGoals?: string[];
  previousSummary?: string;
}

export interface SessionPreparationInput {
  organizationId: string;
  patientRef: PatientRef;
  clinicalContext?: ClinicalContextDescriptor;
  selectedSessions: string;
  currentTreatmentGoals?: string[];
  patientPreferences?: string[];
  previousPlans?: string;
  priorInterventionResponse?: string;
  homework?: string;
  authorizedClinicalNotes?: string;
}

export interface SessionClosingInput {
  organizationId: string;
  patientRef: PatientRef;
  sessionId: string;
  clinicalContext?: ClinicalContextDescriptor;
  finalTranscriptOrSummary: string;
  clinicianNotes?: string;
  interventionsActuallyRecorded?: string;
  priorPlan?: string;
  itemsAlreadyConfirmedByClinician?: string[];
}

export function buildSessionLiveContext(input: SessionLiveInput): string {
  return packContext([
    { label: "CONSENT_STATE", value: input.consentState },
    { label: "PATIENT_CONTEXT", value: input.patientRef },
    { label: "CLINICAL_CONTEXT_DESCRIPTOR", value: input.clinicalContext },
    { label: "TRANSCRIPT_QUALITY", value: input.transcriptQuality },
    { label: "TRANSCRIPT_WINDOW", value: input.transcriptWindow },
    { label: "CLINICIAN_NOTE", value: input.clinicianNotes },
    {
      label: "USER_QUESTION",
      value: "Analise o contexto acima conforme MODO: APOIO DURANTE SESSÃO.",
    },
  ]);
}

export function buildSessionPreparationContext(input: SessionPreparationInput): string {
  return packContext([
    { label: "PATIENT_CONTEXT", value: input.patientRef },
    { label: "CLINICAL_CONTEXT_DESCRIPTOR", value: input.clinicalContext },
    { label: "SELECTED_SESSION", value: input.selectedSessions },
    { label: "CLINICIAN_NOTE", value: input.authorizedClinicalNotes },
    {
      label: "USER_QUESTION",
      value: "Prepare a continuidade clínica conforme MODO: PREPARAÇÃO DA PRÓXIMA SESSÃO.",
    },
  ]);
}

export function buildSessionClosingContext(input: SessionClosingInput): string {
  return packContext([
    { label: "PATIENT_CONTEXT", value: input.patientRef },
    { label: "CLINICAL_CONTEXT_DESCRIPTOR", value: input.clinicalContext },
    { label: "TRANSCRIPT_WINDOW", value: input.finalTranscriptOrSummary },
    { label: "CLINICIAN_NOTE", value: input.clinicianNotes },
    {
      label: "USER_QUESTION",
      value: "Produza o rascunho DPEP conforme MODO: ENCERRAMENTO / PÓS-SESSÃO.",
    },
  ]);
}

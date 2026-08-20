import type { ClinicalContextDescriptor, PatientRef } from "@/features/sessions/ai/dto";
import type { PrimaryApproach, AdditionalFramework } from "@/features/supervisor/contracts";
import { packContext } from "@/lib/ai/context-packer";
import type { RetrievedChunk } from "@/lib/ai/retrieved-chunk";

export type { RetrievedChunk };

export interface SupervisorInput {
  organizationId: string;
  patientRef: PatientRef;
  supervisionGoal: string;
  clinicalQuestion: string;
  selectedSessions: string;
  selectedClinicalNotes?: string;
  treatmentGoals?: string[];
  patientPreferences?: string[];
  therapistContext?: string;
  clinicalContext?: ClinicalContextDescriptor;
  primaryApproach: PrimaryApproach;
  selectedAdditionalFrameworks?: AdditionalFramework[];
  diagnosticReasoningRequested?: boolean;
  retrievedKnowledge?: RetrievedChunk[];
}

export function buildSupervisorContext(input: SupervisorInput): string {
  const clinicianNote =
    input.selectedClinicalNotes || input.therapistContext
      ? {
          selectedClinicalNotes: input.selectedClinicalNotes,
          // Only sent when the psychologist's own reflection is actually
          // needed/authorized for this question, per docs/16
          // "contexto da psicóloga só deve ser enviado quando necessário à
          // pergunta e autorizado" — the caller decides that, this DTO just
          // carries whatever it was given.
          therapistContext: input.therapistContext,
        }
      : undefined;

  return packContext([
    { label: "PATIENT_CONTEXT", value: input.patientRef },
    { label: "CLINICAL_CONTEXT_DESCRIPTOR", value: input.clinicalContext },
    { label: "SELECTED_SESSION", value: input.selectedSessions },
    { label: "CLINICIAN_NOTE", value: clinicianNote },
    {
      label: "SUPERVISION_CONFIG",
      value: {
        supervisionGoal: input.supervisionGoal,
        primaryApproach: input.primaryApproach,
        selectedAdditionalFrameworks: input.selectedAdditionalFrameworks ?? [],
        diagnosticReasoningRequested: Boolean(input.diagnosticReasoningRequested),
        treatmentGoals: input.treatmentGoals ?? [],
        patientPreferences: input.patientPreferences ?? [],
      },
    },
    {
      label: "RETRIEVED_SOURCE",
      value:
        input.retrievedKnowledge && input.retrievedKnowledge.length > 0
          ? input.retrievedKnowledge
          : undefined,
    },
    { label: "USER_QUESTION", value: input.clinicalQuestion },
  ]);
}

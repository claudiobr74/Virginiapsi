import type { RetrievedChunk } from "@/lib/ai/retrieved-chunk";
import type { ClinicalContextDescriptor, PatientRef } from "@/features/sessions/ai/dto";
import { packContext } from "@/lib/ai/context-packer";

export type KnowledgeQueryMode = "query" | "synthesis" | "compare" | "study";

export interface KnowledgeInput {
  organizationId: string;
  collectionIds: string[];
  question: string;
  mode: KnowledgeQueryMode;
  retrievedChunks: RetrievedChunk[];
}

export interface ApplyToCaseInput {
  organizationId: string;
  patientRef: PatientRef;
  question: string;
  minimizedCaseContext: string;
  clinicalContext?: ClinicalContextDescriptor;
  retrievedChunks: RetrievedChunk[];
  explicitApplyToCase: true;
}

function renderChunks(chunks: RetrievedChunk[]): string {
  return chunks
    .map(
      (chunk) =>
        `[${chunk.chunkId}] fonte=${chunk.sourceId} título=${chunk.title ?? "—"} autor=${
          chunk.author ?? "—"
        } ano=${chunk.year ?? "—"} papel=${chunk.studyDesignOrSourceRole ?? "—"} local=${
          chunk.location ?? "—"
        }\n${chunk.text}`,
    )
    .join("\n\n---\n\n");
}

export function buildKnowledgeContext(input: KnowledgeInput): string {
  return packContext([
    { label: "RETRIEVED_SOURCE", value: renderChunks(input.retrievedChunks) },
    { label: "USER_QUESTION", value: input.question },
  ]);
}

export function buildApplyToCaseContext(input: ApplyToCaseInput): string {
  return packContext([
    { label: "PATIENT_CONTEXT", value: input.patientRef },
    { label: "CLINICAL_CONTEXT_DESCRIPTOR", value: input.clinicalContext },
    { label: "RETRIEVED_SOURCE", value: renderChunks(input.retrievedChunks) },
    { label: "CLINICIAN_NOTE", value: input.minimizedCaseContext },
    { label: "USER_QUESTION", value: input.question },
  ]);
}

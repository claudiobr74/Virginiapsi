import { createHash } from "node:crypto";
import { packContext } from "@/lib/ai/context-packer";
import type { DocumentChartImportSelection } from "@/features/documents/chart-import";

export const DOCUMENT_STUDIO_BODY_CHAR_LIMIT = 12_000;

export function sanitizeChartImportSelection(input: unknown): DocumentChartImportSelection {
  if (!input || typeof input !== "object") {
    return {};
  }
  const raw = input as Record<string, unknown>;
  const pick = (key: keyof DocumentChartImportSelection): boolean => raw[key] === true;
  return {
    formulation: pick("formulation"),
    therapyGoals: pick("therapyGoals"),
    lastSession: pick("lastSession"),
    lastThreeSessions: pick("lastThreeSessions"),
    dpep: pick("dpep"),
    additionalNotes: pick("additionalNotes"),
  };
}

export function hasSelectedChartSlice(selection: DocumentChartImportSelection): boolean {
  return Boolean(
    selection.formulation ||
      selection.therapyGoals ||
      selection.lastSession ||
      selection.lastThreeSessions ||
      selection.dpep ||
      selection.additionalNotes,
  );
}

export interface DocumentStudioDraftPackInput {
  templateName: string;
  documentKind: string;
  purpose: string | null;
  recipientName: string | null;
  tone: string;
  lengthPreset: string;
  templateInstructions?: string;
  neverInvent?: string[];
  clinicianAnswers?: Record<string, string>;
  selectedChartContext?: string;
  documentBody?: string;
  command?: string;
}

export function buildDocumentStudioPackedContext(input: DocumentStudioDraftPackInput): string {
  const body = input.documentBody?.slice(0, DOCUMENT_STUDIO_BODY_CHAR_LIMIT) ?? "";
  const command =
    input.command && input.command.length > 0
      ? `Comando: ${input.command}. Produza rascunho em prosa desenvolvida.`
      : "Gere ou desenvolva o rascunho das seções em prosa desenvolvida.";

  return packContext([
    {
      label: "DOCUMENT_META",
      value: {
        templateName: input.templateName,
        documentKind: input.documentKind,
        purpose: input.purpose || "não informada",
        recipientName: input.recipientName || "não informado",
        tone: input.tone,
        lengthPreset: input.lengthPreset,
      },
    },
    { label: "TEMPLATE_INSTRUCTIONS", value: input.templateInstructions },
    {
      label: "TEMPLATE_GUARDRAILS",
      value: input.neverInvent?.length
        ? `Nunca inventar: ${input.neverInvent.join(", ")}.`
        : undefined,
    },
    { label: "CLINICIAN_ANSWERS", value: input.clinicianAnswers },
    { label: "SELECTED_CHART_CONTEXT", value: input.selectedChartContext },
    { label: "DOCUMENT_BODY", value: body },
    { label: "USER_QUESTION", value: command },
  ]);
}

export function hashDocumentStudioPreview(packed: string): string {
  return createHash("sha256").update(packed, "utf8").digest("hex");
}

export function documentStudioAiResultToClient(output: {
  draft: string;
  reviewNotes: string[];
  needsHumanReview: boolean;
}): { draft: string; reviewNotes: string[]; needsHumanReview: boolean } {
  return {
    draft: output.draft,
    reviewNotes: output.reviewNotes,
    needsHumanReview: output.needsHumanReview,
  };
}

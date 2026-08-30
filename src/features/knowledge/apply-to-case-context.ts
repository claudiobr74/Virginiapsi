export const APPLY_TO_CASE_CATEGORY_VALUES = [
  "formulation",
  "therapy_goals",
  "last_session",
  "last_three_sessions",
  "dpep",
  "additional_notes",
] as const;

export type ApplyToCaseCategory = (typeof APPLY_TO_CASE_CATEGORY_VALUES)[number];

export const APPLY_TO_CASE_CATEGORY_LABELS: Record<ApplyToCaseCategory, string> = {
  formulation: "Formulação atual",
  therapy_goals: "Objetivos terapêuticos",
  last_session: "Última sessão",
  last_three_sessions: "Últimas 3 sessões",
  dpep: "DPEP",
  additional_notes: "Observações adicionais",
};

export const DEFAULT_APPLY_TO_CASE_CATEGORIES: Record<ApplyToCaseCategory, boolean> = {
  formulation: true,
  therapy_goals: true,
  last_session: true,
  last_three_sessions: false,
  dpep: false,
  additional_notes: false,
};

export interface ApplyToCaseSelection {
  formulation: boolean;
  therapyGoals: boolean;
  lastSession: boolean;
  lastThreeSessions: boolean;
  dpep: boolean;
  additionalNotes: boolean;
}

export const DEFAULT_APPLY_TO_CASE_SELECTION: ApplyToCaseSelection = {
  formulation: true,
  therapyGoals: true,
  lastSession: true,
  lastThreeSessions: false,
  dpep: false,
  additionalNotes: false,
};

export function selectedApplyToCaseCategories(
  selection: ApplyToCaseSelection,
): ApplyToCaseCategory[] {
  const selected: ApplyToCaseCategory[] = [];
  if (selection.formulation) selected.push("formulation");
  if (selection.therapyGoals) selected.push("therapy_goals");
  if (selection.lastSession) selected.push("last_session");
  if (selection.lastThreeSessions) selected.push("last_three_sessions");
  if (selection.dpep) selected.push("dpep");
  if (selection.additionalNotes) selected.push("additional_notes");
  return selected;
}

const EMAIL_RE = /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/gi;
const CPF_RE = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g;
const PHONE_RE = /(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?9?\d{4}-?\d{4}/g;

export function sanitizeClinicalText(text: string, identifiers: string[] = []): string {
  let result = text;
  const unique = [...new Set(identifiers.map((item) => item.trim()).filter((item) => item.length >= 3))];
  unique.sort((a, b) => b.length - a.length);
  for (const identifier of unique) {
    result = result.split(identifier).join("[redigido]");
  }
  result = result.replace(EMAIL_RE, "[email]");
  result = result.replace(CPF_RE, "[cpf]");
  result = result.replace(PHONE_RE, "[telefone]");
  return result.replace(/\s+/g, " ").trim();
}

export interface ApplyToCaseSourceMaterial {
  modality?: string | null;
  formulation?: string | null;
  therapyGoals?: string | null;
  lastSessionSummary?: string | null;
  lastThreeSessionsSummary?: string | null;
  dpepSummary?: string | null;
  additionalNotes?: string | null;
  identifiers?: string[];
}

export interface ApplyToCaseBuiltContext {
  minimizedCaseContext: string;
  previewLines: string[];
  categories: ApplyToCaseCategory[];
}

function clip(value: string, max = 480): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1).trimEnd()}…`;
}

export function buildApplyToCaseMinimizedContext(
  selection: ApplyToCaseSelection,
  material: ApplyToCaseSourceMaterial,
): ApplyToCaseBuiltContext {
  const identifiers = material.identifiers ?? [];
  const categories = selectedApplyToCaseCategories(selection);
  const parts: string[] = [];
  const previewLines: string[] = [];

  const modality = material.modality?.trim() || "não informada";
  parts.push(`Modalidade: ${modality}.`);
  previewLines.push(`Modalidade: ${modality}`);

  if (selection.therapyGoals) {
    const goals = sanitizeClinicalText(material.therapyGoals ?? "", identifiers);
    const line = goals ? clip(goals) : "(não informado)";
    parts.push(`Objetivo principal: ${line}`);
    previewLines.push(`Objetivo principal: ${line}`);
  }

  if (selection.formulation) {
    const formulation = sanitizeClinicalText(material.formulation ?? "", identifiers);
    const line = formulation ? clip(formulation) : "(não informada)";
    parts.push(`Formulação resumida: ${line}`);
    previewLines.push(`Formulação resumida: ${line}`);
  }

  if (selection.lastThreeSessions) {
    const summary = sanitizeClinicalText(material.lastThreeSessionsSummary ?? "", identifiers);
    const line = summary ? clip(summary, 900) : "(não informado)";
    parts.push(`Resumo clínico (últimas 3 sessões): ${line}`);
    previewLines.push(`Resumo clínico (últimas 3 sessões): ${line}`);
  } else if (selection.lastSession) {
    const summary = sanitizeClinicalText(material.lastSessionSummary ?? "", identifiers);
    const line = summary ? clip(summary) : "(não informado)";
    parts.push(`Resumo clínico selecionado: ${line}`);
    previewLines.push(`Resumo clínico selecionado: ${line}`);
  }

  if (selection.dpep) {
    const dpep = sanitizeClinicalText(material.dpepSummary ?? "", identifiers);
    const line = dpep ? clip(dpep, 900) : "(não informado)";
    parts.push(`DPEP selecionado: ${line}`);
    previewLines.push(`DPEP selecionado: ${line}`);
  }

  if (selection.additionalNotes) {
    const notes = sanitizeClinicalText(material.additionalNotes ?? "", identifiers);
    if (notes) {
      parts.push(`Observações adicionais: ${clip(notes)}`);
      previewLines.push(`Observações adicionais: ${clip(notes)}`);
    }
  }

  return {
    minimizedCaseContext: parts.join("\n"),
    previewLines,
    categories,
  };
}

export function formatApplyToCasePreview(built: ApplyToCaseBuiltContext): string {
  return ["Dados que serão enviados à IA:", "", ...built.previewLines].join("\n");
}

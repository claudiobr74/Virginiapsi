import { sessionClosingOutputSchema, type SessionClosingOutput } from "@/lib/ai/validators/session";

export interface DpepDraftFields {
  demand: string;
  procedures: string;
  evolution: string;
  plan: string;
}

function asTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function fieldsFromDraftObject(draft: unknown): DpepDraftFields | null {
  if (!draft || typeof draft !== "object") {
    return null;
  }
  const record = draft as Record<string, unknown>;
  return {
    demand: asTrimmedString(record.demanda ?? record.demand),
    procedures: asTrimmedString(record.procedimentos ?? record.procedures),
    evolution: asTrimmedString(record.evolucao ?? record.evolution),
    plan: asTrimmedString(record.plano ?? record.plan),
  };
}

export function dpepFieldsHaveContent(fields: DpepDraftFields): boolean {
  return (
    fields.demand.length > 0 ||
    fields.procedures.length > 0 ||
    fields.evolution.length > 0 ||
    fields.plan.length > 0
  );
}

export function dpepFieldsEqual(left: DpepDraftFields, right: DpepDraftFields): boolean {
  return (
    left.demand === right.demand &&
    left.procedures === right.procedures &&
    left.evolution === right.evolution &&
    left.plan === right.plan
  );
}

export function emptyDpepFields(): DpepDraftFields {
  return { demand: "", procedures: "", evolution: "", plan: "" };
}

/**
 * Pulls the four DPEP fields from a Session Closing payload.
 * Accepts the strict contract, a nested `dpepDraft`, or a flat 4-field object.
 * Does not invent clinical content for missing properties.
 */
export function extractDpepDraft(content: unknown): DpepDraftFields | null {
  const strict = sessionClosingOutputSchema.safeParse(content);
  if (strict.success) {
    const fields = fieldsFromDraftObject(strict.data.dpepDraft);
    return fields && dpepFieldsHaveContent(fields) ? fields : null;
  }

  if (content && typeof content === "object") {
    const record = content as Record<string, unknown>;
    const nested = fieldsFromDraftObject(record.dpepDraft);
    if (nested && dpepFieldsHaveContent(nested)) {
      return nested;
    }
    const flat = fieldsFromDraftObject(record);
    if (flat && dpepFieldsHaveContent(flat)) {
      return flat;
    }
  }

  return null;
}

const EMPTY_SAFETY: SessionClosingOutput["safety"] = {
  severity: "none",
  domains: [],
  explicitSignals: [],
  missingInformation: [],
};

/**
 * Strict parse first; if only the DPEP draft is recoverable, coerce the rest
 * of the contract to empty fail-closed defaults (no invented clinical facts).
 */
export function coerceSessionClosingOutput(raw: unknown): SessionClosingOutput | null {
  const strict = sessionClosingOutputSchema.safeParse(raw);
  if (strict.success) {
    return strict.data;
  }

  const draft = extractDpepDraft(raw);
  if (!draft) {
    return null;
  }

  return {
    dpepDraft: {
      demanda: draft.demand,
      procedimentos: draft.procedures,
      evolucao: draft.evolution,
      plano: draft.plan,
    },
    separateClinicalWorkingNoteCandidates: [],
    clinicalHypotheses: [],
    followUpPoints: [],
    itemsRequiringClinicianConfirmation: [],
    safety: EMPTY_SAFETY,
    uncertainties: [],
  };
}

/** Confirm before applying an AI draft when the live form already has text. */
export function shouldConfirmDpepReplace(current: DpepDraftFields): boolean {
  return dpepFieldsHaveContent(current);
}

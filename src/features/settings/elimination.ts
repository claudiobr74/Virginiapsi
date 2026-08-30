import { PATIENT_DATA_CLASS_POLICIES } from "@/domain/patient-data-inventory";

export const ELIMINATION_PHRASE_PREFIX = "ELIMINAR PERMANENTEMENTE";

export function expectedEliminationPhrase(publicCode: string): string {
  return `${ELIMINATION_PHRASE_PREFIX} ${publicCode.trim().toUpperCase()}`;
}

export function eliminationPhraseMatches(
  provided: string,
  publicCode: string,
): boolean {
  return provided.trim().toUpperCase() === expectedEliminationPhrase(publicCode);
}

export interface EliminationPlanSummary {
  deleted: string[];
  anonymized: string[];
  retained: string[];
  errors: string[];
}

export interface EliminationVerifyResult {
  status: "eliminated" | "partially_eliminated" | "retained_by_policy" | "failed";
  remainingDataClasses: string[];
  retainedDataClasses: string[];
  errors: string[];
}

export function buildEliminationReport(input: {
  publicCode: string;
  preferredName: string;
  presentClasses: string[];
}): {
  eliminate: string[];
  retain: string[];
  outcome: "partially_eliminated" | "eliminated";
  retainedReason: string | null;
} {
  const present = new Set(input.presentClasses);
  const eliminate: string[] = [
    `Identificadores administrativos de ${input.preferredName} (${input.publicCode}): nome, e-mail, telefone, CPF, nascimento, responsáveis e foto`,
  ];
  const retain: string[] = [];

  for (const policy of PATIENT_DATA_CLASS_POLICIES) {
    if (policy.dataClass === "patient_identifiers" || policy.dataClass === "patient_photo") {
      continue;
    }
    if (!present.has(policy.dataClass) && policy.policy === "RETAIN_WITH_LEGAL_REASON") {
      continue;
    }
    if (!present.has(policy.dataClass) && policy.policy !== "RETAIN_WITH_LEGAL_REASON") {
      if (!present.has(policy.dataClass)) continue;
    }
    if (policy.policy === "RETAIN_WITH_LEGAL_REASON" && present.has(policy.dataClass)) {
      retain.push(
        `${policy.dataClass}: ${policy.notes} Fundamento: ${policy.legalBasisKey ?? "não informado"} (revisão jurídica pendente).`,
      );
    } else if (present.has(policy.dataClass)) {
      eliminate.push(`${policy.dataClass}: ${policy.notes}`);
    }
  }

  if (retain.length === 0) {
    retain.push("Nenhum registro clínico, financeiro ou de consentimento a reter");
  }

  return {
    eliminate,
    retain,
    outcome: retain.some((item) => item.startsWith("Nenhum registro"))
      ? "eliminated"
      : "partially_eliminated",
    retainedReason: retain.some((item) => item.startsWith("Nenhum registro"))
      ? null
      : "Retenção conforme patient_data_class_policies (fundamento configurável; revisão jurídica pendente).",
  };
}

export function mapVerifyRow(row: {
  status?: string;
  remaining_data_classes?: string[] | null;
  retained_data_classes?: string[] | null;
  errors?: string[] | null;
}): EliminationVerifyResult {
  const remainingDataClasses = row.remaining_data_classes ?? [];
  const retainedDataClasses = row.retained_data_classes ?? [];
  const errors = row.errors ?? [];
  let status = row.status;
  if (errors.length > 0) {
    status = "failed";
  } else if (remainingDataClasses.length > 0) {
    status = "partially_eliminated";
  }
  if (
    status === "eliminated" ||
    status === "partially_eliminated" ||
    status === "retained_by_policy" ||
    status === "failed"
  ) {
    return {
      status,
      remainingDataClasses,
      retainedDataClasses,
      errors,
    };
  }
  return {
    status: "failed",
    remainingDataClasses,
    retainedDataClasses,
    errors: errors.length > 0 ? errors : ["invalid_verify_status"],
  };
}

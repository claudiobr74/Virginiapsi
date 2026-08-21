export const ELIMINATION_PHRASE_PREFIX = "ELIMINAR PERMANENTEMENTE";

export const ELIMINATION_RETAINED_REASON =
  "Prontuário, DPEP, transcrição, financeiro, consentimentos e auditoria retidos por obrigação legal e profissional (guarda mínima de prontuário / fiscal / trilha de auditoria).";

export function expectedEliminationPhrase(publicCode: string): string {
  return `${ELIMINATION_PHRASE_PREFIX} ${publicCode.trim().toUpperCase()}`;
}

export function eliminationPhraseMatches(
  provided: string,
  publicCode: string,
): boolean {
  return provided.trim().toUpperCase() === expectedEliminationPhrase(publicCode);
}

export interface EliminationCounts {
  clinicalSessions: number;
  clinicalProfiles: number;
  consents: number;
  financialCharges: number;
  transcriptSegments: number;
}

export function resolveEliminationOutcome(counts: EliminationCounts): {
  status: "partially_eliminated" | "eliminated";
  retainedReason: string | null;
} {
  const mustRetain =
    counts.clinicalSessions > 0 ||
    counts.clinicalProfiles > 0 ||
    counts.consents > 0 ||
    counts.financialCharges > 0 ||
    counts.transcriptSegments > 0;

  if (mustRetain) {
    return {
      status: "partially_eliminated",
      retainedReason: ELIMINATION_RETAINED_REASON,
    };
  }

  return { status: "eliminated", retainedReason: null };
}

export function buildEliminationReport(input: {
  publicCode: string;
  preferredName: string;
  counts: EliminationCounts;
}): {
  eliminate: string[];
  retain: string[];
  outcome: "partially_eliminated" | "eliminated";
  retainedReason: string | null;
} {
  const outcome = resolveEliminationOutcome(input.counts);
  return {
    eliminate: [
      `Identificadores administrativos de ${input.preferredName} (${input.publicCode}): nome, e-mail, telefone, CPF, nascimento, responsáveis e foto`,
    ],
    retain: outcome.retainedReason
      ? [
          input.counts.clinicalSessions > 0
            ? `${input.counts.clinicalSessions} sessão(ões) / prontuário / DPEP`
            : null,
          input.counts.clinicalProfiles > 0 ? "Perfil clínico" : null,
          input.counts.transcriptSegments > 0
            ? `${input.counts.transcriptSegments} segmento(s) de transcrição`
            : null,
          input.counts.financialCharges > 0
            ? `${input.counts.financialCharges} cobrança(s) financeira(s)`
            : null,
          input.counts.consents > 0
            ? `${input.counts.consents} consentimento(s)`
            : null,
          "Trilha de auditoria (append-only)",
        ].filter((item): item is string => Boolean(item))
      : ["Nenhum registro clínico, financeiro ou de consentimento a reter"],
    outcome: outcome.status,
    retainedReason: outcome.retainedReason,
  };
}

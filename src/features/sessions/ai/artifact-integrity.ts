export const AI_ARTIFACT_ISOLATION_PREFIX = "ai_artifact_isolation_violation";

export type AiArtifactAppendMode = "session_closing" | "supervisor";

export function isAiArtifactIsolationError(message: string | null | undefined): boolean {
  return Boolean(message && message.includes(AI_ARTIFACT_ISOLATION_PREFIX));
}

export function mapAiArtifactAppendError(message: string | null | undefined): string {
  const text = message ?? "";
  if (isAiArtifactIsolationError(text)) {
    return "Este rascunho de IA não pertence a esta sessão ou a este paciente. Nada foi alterado.";
  }
  if (/already reviewed/i.test(text)) {
    return "Este rascunho já foi revisado.";
  }
  if (/not authorized/i.test(text) || /requires authentication/i.test(text)) {
    return "forbidden_role";
  }
  if (/not found/i.test(text)) {
    return "Rascunho de IA não encontrado.";
  }
  if (/supervisor append requires/i.test(text)) {
    return "Selecione ao menos um campo para anexar.";
  }
  return "Não foi possível salvar — a sessão pode ter sido alterada. Recarregue.";
}

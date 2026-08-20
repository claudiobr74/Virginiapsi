import "server-only";

import { resolveConsentState } from "@/features/consents/queries";
import type { ConsentState } from "@/features/consents/contracts";
import { requireOrgContext } from "@/lib/auth/require-org-context";
import { logAuditEvent } from "@/lib/audit/log-audit-event";

export type SessionAiPurpose = "session_live" | "session_preparation" | "session_closing";

export interface SessionAiGrant {
  allowed: true;
  organizationId: string;
  consentState: ConsentState;
}

export interface SessionAiDenial {
  allowed: false;
  reason: "forbidden_role" | "ai_processing_denied" | "transcription_required_denied";
  message: string;
}

export type SessionAiGateResult = SessionAiGrant | SessionAiDenial;

const MESSAGES: Record<SessionAiDenial["reason"], string> = {
  forbidden_role: "Somente a psicóloga administradora usa a IA de sessão.",
  ai_processing_denied: "Consentimento de apoio de IA não está válido para este paciente.",
  transcription_required_denied:
    "Este modo usa a transcrição da sessão; o consentimento de transcrição não está válido.",
};

/**
 * Consent is backend property, not a model decision
 * (docs/14-runtime-ai-architecture.md §3). `session_live` and
 * `session_closing` additionally require transcription consent because
 * their DTO carries transcript content (docs/16-runtime-ai-data-contracts.md
 * §ConsentState: "Session Live/transcrição exigem os estados aplicáveis
 * como true"); `session_preparation` only summarizes already-recorded DPEP
 * content, so it needs `aiProcessingAllowed` alone.
 */
export async function authorizeSessionAi(
  patientId: string,
  purpose: SessionAiPurpose,
): Promise<SessionAiGateResult> {
  const { organizationId, role } = await requireOrgContext();

  if (role !== "psychologist_admin") {
    return { allowed: false, reason: "forbidden_role", message: MESSAGES.forbidden_role };
  }

  const resolution = await resolveConsentState(organizationId, patientId);
  const { state } = resolution;

  if (!state.aiProcessingAllowed) {
    await logAuditEvent({
      organizationId,
      action: "session_ai.denied",
      resourceType: "consent",
      resourceId: patientId,
      metadata: { purpose, reason: "ai_processing_denied" },
    });
    return {
      allowed: false,
      reason: "ai_processing_denied",
      message: MESSAGES.ai_processing_denied,
    };
  }

  const usesTranscript = purpose === "session_live" || purpose === "session_closing";
  if (usesTranscript && !state.transcriptionAllowed) {
    await logAuditEvent({
      organizationId,
      action: "session_ai.denied",
      resourceType: "consent",
      resourceId: patientId,
      metadata: { purpose, reason: "transcription_required_denied" },
    });
    return {
      allowed: false,
      reason: "transcription_required_denied",
      message: MESSAGES.transcription_required_denied,
    };
  }

  return { allowed: true, organizationId, consentState: state };
}

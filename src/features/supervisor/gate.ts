import "server-only";

import { resolveConsentState } from "@/features/consents/queries";
import type { ConsentState } from "@/features/consents/contracts";
import { requireOrgContext } from "@/lib/auth/require-org-context";
import { logAuditEvent } from "@/lib/audit/log-audit-event";

export interface SupervisorGrant {
  allowed: true;
  organizationId: string;
  consentState: ConsentState;
}

export interface SupervisorDenial {
  allowed: false;
  reason: "forbidden_role" | "ai_processing_denied";
  message: string;
}

export type SupervisorGateResult = SupervisorGrant | SupervisorDenial;

/**
 * Same boundary as Session AI's gate (docs/14-runtime-ai-architecture.md
 * §3): consent is a backend property. The Supervisor draws only from
 * already-recorded DPEP/working notes, never raw transcript, so it needs
 * `aiProcessingAllowed` alone — no transcription-specific check.
 */
export async function authorizeSupervisorAi(patientId: string): Promise<SupervisorGateResult> {
  const { organizationId, role } = await requireOrgContext();

  if (role !== "psychologist_admin") {
    return {
      allowed: false,
      reason: "forbidden_role",
      message: "Somente a psicóloga administradora usa o Supervisor Clínico IA.",
    };
  }

  const { state } = await resolveConsentState(organizationId, patientId);

  if (!state.aiProcessingAllowed) {
    await logAuditEvent({
      organizationId,
      action: "supervisor_ai.denied",
      resourceType: "consent",
      resourceId: patientId,
      metadata: { reason: "ai_processing_denied" },
    });
    return {
      allowed: false,
      reason: "ai_processing_denied",
      message: "Consentimento de apoio de IA não está válido para este paciente.",
    };
  }

  return { allowed: true, organizationId, consentState: state };
}

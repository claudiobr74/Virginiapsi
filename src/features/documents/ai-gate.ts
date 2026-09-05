import "server-only";

import { resolveConsentState } from "@/features/consents/queries";
import type { ConsentState } from "@/features/consents/contracts";
import {
  DOCUMENT_STUDIO_AI_CONSENT_DENIED,
  documentStudioAiMayCallProvider,
} from "@/features/documents/ai-policy";
import { hasPatientClinicalAccess } from "@/features/patients/clinical-access";
import { isClinicalPractitioner } from "@/features/organizations/roles";
import { requireOrgContext } from "@/lib/auth/require-org-context";
import { logAuditEvent } from "@/lib/audit/log-audit-event";

export interface DocumentStudioAiGrant {
  allowed: true;
  organizationId: string;
  userId: string;
  consentState: ConsentState | null;
}

export interface DocumentStudioAiDenial {
  allowed: false;
  reason: "forbidden_role" | "ai_processing_denied";
  message: string;
}

export type DocumentStudioAiGateResult = DocumentStudioAiGrant | DocumentStudioAiDenial;

/**
 * Same backend-precondition as Session/Supervisor (docs/14 §3):
 * patient-linked Document Studio drafts cannot call Gemini unless
 * `aiProcessingAllowed` is true. Chart-import selection does not change this.
 * Parecer without patient_id has no consent record to resolve.
 * Preview of the packed envelope is a clinical-access check only (no provider).
 */
export async function authorizeDocumentStudioAi(
  patientId: string | null,
  purpose: "preview" | "provider" = "provider",
): Promise<DocumentStudioAiGateResult> {
  const { organizationId, role, user } = await requireOrgContext();

  if (!isClinicalPractitioner(role)) {
    return {
      allowed: false,
      reason: "forbidden_role",
      message: "Somente a profissional responsável usa a redação assistida.",
    };
  }

  if (!patientId) {
    return { allowed: true, organizationId, userId: user.id, consentState: null };
  }

  if (
    !(await hasPatientClinicalAccess({
      organizationId,
      role,
      userId: user.id,
      patientId,
    }))
  ) {
    return {
      allowed: false,
      reason: "forbidden_role",
      message: "Somente a profissional responsável usa a redação assistida.",
    };
  }

  if (purpose === "preview") {
    return { allowed: true, organizationId, userId: user.id, consentState: null };
  }

  const { state } = await resolveConsentState(organizationId, patientId);
  const decision = documentStudioAiMayCallProvider({
    patientId,
    aiProcessingAllowed: state.aiProcessingAllowed,
  });
  if (!decision.allowed) {
    await logAuditEvent({
      organizationId,
      action: "document_studio_ai.denied",
      resourceType: "consent",
      resourceId: patientId,
      metadata: { reason: "ai_processing_denied" },
    });
    return {
      allowed: false,
      reason: "ai_processing_denied",
      message: DOCUMENT_STUDIO_AI_CONSENT_DENIED,
    };
  }

  return { allowed: true, organizationId, userId: user.id, consentState: state };
}


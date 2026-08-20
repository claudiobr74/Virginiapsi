import "server-only";

import {
  CONSENT_DENIAL_MESSAGES,
  evaluateCaptureCapability,
  type CaptureCapability,
  type ConsentDenialReason,
  type ConsentState,
} from "@/features/consents/contracts";
import { resolveConsentState } from "@/features/consents/queries";
import { requireOrgContext } from "@/lib/auth/require-org-context";
import { logAuditEvent } from "@/lib/audit/log-audit-event";

export interface CapabilityGrant {
  allowed: true;
  organizationId: string;
  patientId: string;
  state: ConsentState;
}

export interface CapabilityDenial {
  allowed: false;
  status: 403;
  reason: ConsentDenialReason | "forbidden_role";
  message: string;
}

export type CapabilityGateResult = CapabilityGrant | CapabilityDenial;

/**
 * The single chokepoint every audio-capture capability must pass through:
 * the Deepgram temporary token and the fallback signed upload grant both call
 * this before anything is issued (docs/03-architecture.md §Clinical AI
 * boundary; docs/08-implementation-phases.md Fase 5.5).
 *
 * It fails closed on every unknown: missing consent, revoked consent, missing
 * birth date, minor without guardian authorization/assent, or a role that is
 * not allowed to run a clinical session. No provider is contacted and no
 * signed grant is minted before this returns `allowed: true`.
 */
export async function authorizeCaptureCapability(
  patientId: string,
  capability: CaptureCapability,
): Promise<CapabilityGateResult> {
  const { organizationId, role } = await requireOrgContext();

  if (role !== "psychologist_admin") {
    return {
      allowed: false,
      status: 403,
      reason: "forbidden_role",
      message: "Somente a psicóloga administradora conduz sessão clínica.",
    };
  }

  const resolution = await resolveConsentState(organizationId, patientId);
  const decision = evaluateCaptureCapability(resolution, capability);

  if (!decision.allowed) {
    const reason = decision.reason ?? "consent_missing";
    // Denials are audited: a capture that was refused is as relevant to the
    // record as one that happened.
    await logAuditEvent({
      organizationId,
      action: "capture_capability.denied",
      resourceType: "consent",
      resourceId: patientId,
      metadata: { capability, reason },
    });

    return {
      allowed: false,
      status: 403,
      reason,
      message: CONSENT_DENIAL_MESSAGES[reason],
    };
  }

  return {
    allowed: true,
    organizationId,
    patientId,
    state: resolution.state,
  };
}

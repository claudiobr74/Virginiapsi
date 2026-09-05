import "server-only";

import {
  CONSENT_DENIAL_MESSAGES,
  evaluateCaptureCapability,
  type CaptureCapability,
  type ConsentDenialReason,
  type ConsentState,
} from "@/features/consents/contracts";
import { resolveConsentState } from "@/features/consents/queries";
import {
  signCaptureGrant,
  verifyCaptureGrant,
  type VerifyCaptureGrantExpectedScope,
  type VerifyCaptureGrantResult,
} from "@/lib/consent/capture-grant";
import { hasPatientClinicalAccess } from "@/features/patients/clinical-access";
import { requireOrgContext } from "@/lib/auth/require-org-context";
import { logAuditEvent } from "@/lib/audit/log-audit-event";
import { getSessionCaptureEnv } from "@/lib/env/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface CapabilityGrant {
  allowed: true;
  organizationId: string;
  patientId: string;
  sessionId: string;
  state: ConsentState;
}

export interface CapabilityDenial {
  allowed: false;
  status: 403 | 404;
  reason: ConsentDenialReason | "forbidden_role" | "session_not_found";
  message: string;
}

export type CapabilityGateResult = CapabilityGrant | CapabilityDenial;

const NON_CONSENT_MESSAGES = {
  forbidden_role: "Somente a psicóloga responsável conduz sessão clínica.",
  session_not_found: "Sessão clínica não encontrada para este paciente.",
} as const;

async function sessionBelongsToPatient(
  organizationId: string,
  sessionId: string,
  patientId: string,
): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("clinical_sessions")
    .select("id, organization_id, patient_id")
    .eq("id", sessionId)
    .maybeSingle();

  return Boolean(
    data &&
      data.organization_id === organizationId &&
      data.patient_id === patientId,
  );
}

/**
 * The single chokepoint every audio-capture capability must pass through: the
 * remote live-transcription grant (which authorizes getUserMedia only after
 * this gate) and the fallback signed upload grant both call this
 * before anything is issued (docs/03-architecture.md §Clinical AI boundary;
 * docs/08-implementation-phases.md Fase 5.5/6;
 * docs/22-transcription-provider-decision.md).
 *
 * It fails closed on every unknown: missing consent, revoked consent, missing
 * birth date, minor without guardian authorization/assent, a role that is not
 * allowed to run a clinical session, or a session that does not actually
 * belong to the given patient/organization. No microphone is activated, no
 * provider is contacted and no signed grant is minted before this returns
 * `allowed: true`.
 */
export async function authorizeCaptureCapability(
  patientId: string,
  sessionId: string,
  capability: CaptureCapability,
): Promise<CapabilityGateResult> {
  const { organizationId, role, user } = await requireOrgContext();

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
      status: 403,
      reason: "forbidden_role",
      message: NON_CONSENT_MESSAGES.forbidden_role,
    };
  }

  if (!(await sessionBelongsToPatient(organizationId, sessionId, patientId))) {
    return {
      allowed: false,
      status: 404,
      reason: "session_not_found",
      message: NON_CONSENT_MESSAGES.session_not_found,
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
      metadata: { capability, reason, sessionId },
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
    sessionId,
    state: resolution.state,
  };
}

/**
 * Mints the signed grant token once `authorizeCaptureCapability()` has
 * already returned `allowed: true`. Kept as a separate step (rather than
 * folded into the gate) so the gate's audited denial path never needs to
 * touch the signing secret.
 */
export function issueCaptureGrant(
  grant: CapabilityGrant,
  capability: CaptureCapability,
): string {
  const env = getSessionCaptureEnv();
  return signCaptureGrant(
    {
      organizationId: grant.organizationId,
      patientId: grant.patientId,
      sessionId: grant.sessionId,
      capability,
    },
    env.SESSION_CAPTURE_SECRET,
  );
}

/**
 * Server-side enforcement for a signed capture grant. Live Groq chunks
 * require `session_remote_transcription_grant`; import uses
 * `audio_fallback_upload_grant`. The legacy `session_capture_grant` remains
 * valid only for the historical segment persist path.
 */
export function verifyCaptureGrantToken(
  token: string,
  expectedScope: VerifyCaptureGrantExpectedScope,
): VerifyCaptureGrantResult {
  const env = getSessionCaptureEnv();
  return verifyCaptureGrant(token, env.SESSION_CAPTURE_SECRET, expectedScope);
}

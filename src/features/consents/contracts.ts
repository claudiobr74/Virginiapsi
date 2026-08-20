import { z } from "zod";

export const CONSENT_TYPE_VALUES = [
  "service_terms",
  "psychotherapy",
  "ai_processing",
  "session_recording",
  "session_transcription",
  "whatsapp",
  "other",
] as const;
export type ConsentType = (typeof CONSENT_TYPE_VALUES)[number];

/** The three types the Phase 6 capture gate depends on. */
export const CAPTURE_CONSENT_TYPES = [
  "ai_processing",
  "session_recording",
  "session_transcription",
] as const;
export type CaptureConsentType = (typeof CAPTURE_CONSENT_TYPES)[number];

export const CONSENT_TYPE_LABELS: Record<ConsentType, string> = {
  service_terms: "Termos de serviço",
  psychotherapy: "Psicoterapia",
  ai_processing: "Apoio de IA",
  session_recording: "Gravação da sessão",
  session_transcription: "Transcrição da sessão",
  whatsapp: "Comunicação por WhatsApp",
  other: "Outro",
};

export const CONSENT_STATUS_VALUES = [
  "pending",
  "accepted",
  "revoked",
  "expired",
] as const;
export type ConsentStatus = (typeof CONSENT_STATUS_VALUES)[number];

export const CONSENT_STATUS_LABELS: Record<ConsentStatus, string> = {
  pending: "Pendente",
  accepted: "Registrado",
  revoked: "Revogado",
  expired: "Expirado",
};

/**
 * Version of the minimal pre-TCLE consent record. The full TCLE text and its
 * own versioning arrive in Phase 9; adding a suboperator or changing the text
 * requires a new version here (docs/19-lgpd-privacy.md §2).
 */
export const MINIMAL_CONSENT_VERSION = "minimo-2026-08";

export const consentRowSchema = z.object({
  id: z.string().uuid(),
  organization_id: z.string().uuid(),
  patient_id: z.string().uuid(),
  type: z.enum(CONSENT_TYPE_VALUES),
  title: z.string(),
  version: z.string(),
  status: z.enum(CONSENT_STATUS_VALUES),
  accepted_at: z.string().nullable(),
  expires_at: z.string().nullable(),
  guardian_authorization: z.boolean(),
  guardian_name: z.string().nullable(),
  patient_assent: z.boolean(),
  revoked_at: z.string().nullable(),
  created_at: z.string(),
});
export type ConsentRow = z.infer<typeof consentRowSchema>;

export const recordConsentSchema = z.object({
  patientId: z.string().uuid(),
  type: z.enum(CAPTURE_CONSENT_TYPES),
  guardianAuthorization: z.boolean().default(false),
  guardianName: z.string().trim().max(160).optional().or(z.literal("")),
  patientAssent: z.boolean().default(false),
});
export type RecordConsentValues = z.infer<typeof recordConsentSchema>;

// ---------------------------------------------------------------------------
// Age rules
// ---------------------------------------------------------------------------

export type AgeGroup = "child" | "adolescent" | "adult" | "unknown";

export interface MinorRequirement {
  ageGroup: AgeGroup;
  isMinor: boolean;
  requiresGuardianAuthorization: boolean;
  /**
   * Formal assent is required from adolescents. For children the clinician
   * still listens to the child, but the blocking requirement is the
   * guardian's authorization — mirroring the ECA age split (criança 0–11,
   * adolescente 12–17).
   */
  requiresAssent: boolean;
}

export function ageInYears(birthDate: string, at: Date): number {
  const [year, month, day] = birthDate.split("-").map(Number);
  let age = at.getUTCFullYear() - year;
  const monthDiff = at.getUTCMonth() + 1 - month;
  if (monthDiff < 0 || (monthDiff === 0 && at.getUTCDate() < day)) {
    age -= 1;
  }
  return age;
}

/**
 * An unknown birth date fails closed (`unknown` blocks capture): without it we
 * cannot tell whether guardian authorization is required, and recording a
 * minor without it is exactly the harm this gate exists to prevent.
 */
export function resolveMinorRequirement(
  birthDate: string | null,
  at: Date = new Date(),
): MinorRequirement {
  if (!birthDate) {
    return {
      ageGroup: "unknown",
      isMinor: false,
      requiresGuardianAuthorization: false,
      requiresAssent: false,
    };
  }

  const age = ageInYears(birthDate, at);
  if (age >= 18) {
    return {
      ageGroup: "adult",
      isMinor: false,
      requiresGuardianAuthorization: false,
      requiresAssent: false,
    };
  }

  const ageGroup: AgeGroup = age >= 12 ? "adolescent" : "child";
  return {
    ageGroup,
    isMinor: true,
    requiresGuardianAuthorization: true,
    requiresAssent: ageGroup === "adolescent",
  };
}

// ---------------------------------------------------------------------------
// ConsentState (docs/16-runtime-ai-data-contracts.md)
// ---------------------------------------------------------------------------

/**
 * Exactly the shape of docs/16-runtime-ai-data-contracts.md §ConsentState.
 * Deliberately free of any narrative/justification field: a refusal must never
 * travel into clinical formulation as "resistance"
 * (docs/17-clinical-ai-review-v1.2.md §3.14).
 */
export interface ConsentState {
  aiProcessingAllowed: boolean;
  recordingAllowed: boolean;
  transcriptionAllowed: boolean;
  consentVersion?: string;
  consentRecordedAt?: string;
  minorGuardianAuthorizationValid?: boolean;
  minorAssentRecorded?: boolean;
}

export type ConsentDenialReason =
  | "consent_missing"
  | "consent_revoked"
  | "consent_expired"
  | "consent_pending"
  | "birth_date_missing"
  | "minor_guardian_authorization_missing"
  | "minor_assent_missing";

export interface ConsentResolution {
  state: ConsentState;
  ageGroup: AgeGroup;
  /** Server-side detail; never part of the AI-facing ConsentState DTO. */
  denials: Partial<Record<CaptureConsentType, ConsentDenialReason>>;
}

function latestByType(rows: ConsentRow[], type: CaptureConsentType): ConsentRow | null {
  return (
    rows
      .filter((row) => row.type === type)
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0] ?? null
  );
}

function evaluateRow(
  row: ConsentRow | null,
  requirement: MinorRequirement,
  at: Date,
): { allowed: boolean; reason?: ConsentDenialReason } {
  if (requirement.ageGroup === "unknown") {
    return { allowed: false, reason: "birth_date_missing" };
  }
  if (!row) {
    return { allowed: false, reason: "consent_missing" };
  }
  if (row.status === "revoked" || row.revoked_at) {
    return { allowed: false, reason: "consent_revoked" };
  }
  if (row.status === "pending") {
    return { allowed: false, reason: "consent_pending" };
  }
  if (row.status === "expired") {
    return { allowed: false, reason: "consent_expired" };
  }
  if (row.expires_at && new Date(row.expires_at).getTime() <= at.getTime()) {
    return { allowed: false, reason: "consent_expired" };
  }
  if (requirement.requiresGuardianAuthorization && !row.guardian_authorization) {
    return { allowed: false, reason: "minor_guardian_authorization_missing" };
  }
  if (requirement.requiresAssent && !row.patient_assent) {
    return { allowed: false, reason: "minor_assent_missing" };
  }
  return { allowed: true };
}

export function resolveConsentStateFromRows(input: {
  rows: ConsentRow[];
  birthDate: string | null;
  at?: Date;
}): ConsentResolution {
  const at = input.at ?? new Date();
  const requirement = resolveMinorRequirement(input.birthDate, at);

  const denials: ConsentResolution["denials"] = {};
  const allowed: Record<CaptureConsentType, boolean> = {
    ai_processing: false,
    session_recording: false,
    session_transcription: false,
  };

  const latestRows: ConsentRow[] = [];
  for (const type of CAPTURE_CONSENT_TYPES) {
    const row = latestByType(input.rows, type);
    if (row) {
      latestRows.push(row);
    }
    const evaluation = evaluateRow(row, requirement, at);
    allowed[type] = evaluation.allowed;
    if (evaluation.reason) {
      denials[type] = evaluation.reason;
    }
  }

  const effectiveRows = latestRows.filter(
    (row) => row.status === "accepted" && !row.revoked_at,
  );
  const newestAccepted = effectiveRows.sort((a, b) =>
    a.created_at < b.created_at ? 1 : -1,
  )[0];

  const state: ConsentState = {
    aiProcessingAllowed: allowed.ai_processing,
    recordingAllowed: allowed.session_recording,
    transcriptionAllowed: allowed.session_transcription,
  };

  if (newestAccepted) {
    state.consentVersion = newestAccepted.version;
    state.consentRecordedAt = newestAccepted.accepted_at ?? undefined;
  }

  if (requirement.isMinor) {
    state.minorGuardianAuthorizationValid =
      effectiveRows.length > 0 &&
      effectiveRows.every((row) => row.guardian_authorization);
    state.minorAssentRecorded = requirement.requiresAssent
      ? effectiveRows.length > 0 && effectiveRows.every((row) => row.patient_assent)
      : effectiveRows.some((row) => row.patient_assent);
  }

  return { state, ageGroup: requirement.ageGroup, denials };
}

// ---------------------------------------------------------------------------
// Capture capability gate
// ---------------------------------------------------------------------------

export const CAPTURE_CAPABILITIES = [
  "session_capture_grant",
  "audio_fallback_upload_grant",
] as const;
export type CaptureCapability = (typeof CAPTURE_CAPABILITIES)[number];

export interface CapabilityDecision {
  allowed: boolean;
  reason?: ConsentDenialReason;
}

/**
 * Both capture capabilities — the session capture grant that authorizes
 * on-device transcription and the fallback signed upload grant — require the
 * same recording + transcription consent (docs/03-architecture.md §Clinical AI
 * boundary, docs/05-security-rbac-rls.md §Áudio/transcrição,
 * docs/22-transcription-provider-decision.md). There is intentionally no
 * capability that requires less: capturing on the device is not a lesser act
 * than shipping the audio out.
 */
export function evaluateCaptureCapability(
  resolution: ConsentResolution,
  _capability: CaptureCapability,
): CapabilityDecision {
  const { state, denials } = resolution;

  if (!state.recordingAllowed) {
    return { allowed: false, reason: denials.session_recording ?? "consent_missing" };
  }
  if (!state.transcriptionAllowed) {
    return {
      allowed: false,
      reason: denials.session_transcription ?? "consent_missing",
    };
  }
  return { allowed: true };
}

export const CONSENT_DENIAL_MESSAGES: Record<ConsentDenialReason, string> = {
  consent_missing: "Consentimento não registrado para este paciente.",
  consent_revoked: "Consentimento revogado.",
  consent_expired: "Consentimento expirado.",
  consent_pending: "Consentimento ainda não foi aceito.",
  birth_date_missing:
    "Data de nascimento ausente no cadastro — não é possível verificar exigências de menor de idade.",
  minor_guardian_authorization_missing:
    "Falta autorização do responsável para este paciente menor de idade.",
  minor_assent_missing:
    "Falta anuência do adolescente registrada para este paciente.",
};

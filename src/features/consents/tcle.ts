import type { ConsentRow } from "@/features/consents/contracts";

export const TCLE_CONSENT_TYPES = ["service_terms", "psychotherapy"] as const;
export type TcleConsentType = (typeof TCLE_CONSENT_TYPES)[number];

export type TcleStatus = "never_accepted" | "current" | "outdated" | "revoked";

export const TCLE_TYPE_LABELS: Record<TcleConsentType, string> = {
  service_terms: "Termos de Serviço",
  psychotherapy: "TCLE de Psicoterapia",
};

export const TCLE_STATUS_LABELS: Record<TcleStatus, string> = {
  never_accepted: "Não aceito",
  current: "Aceito — versão vigente",
  outdated: "Aceito em versão anterior",
  revoked: "Revogado",
};

export interface TcleResolution {
  status: TcleStatus;
  latest: ConsentRow | null;
}

/**
 * Whether the most recent record for this TCLE type still reflects the
 * text the patient would see today. A version bump (docs/19-lgpd-privacy.md
 * §2 — new suboperator, changed retention, etc.) makes every prior
 * acceptance "outdated" rather than silently keeping it valid: consent to
 * an old text is not consent to a text that has since changed.
 */
export function resolveTcleStatus(
  rows: ConsentRow[],
  type: TcleConsentType,
  currentVersion: string,
): TcleResolution {
  const latest = rows
    .filter((row) => row.type === type)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0];

  if (!latest) {
    return { status: "never_accepted", latest: null };
  }
  if (latest.status === "revoked" || latest.revoked_at) {
    return { status: "revoked", latest };
  }
  if (latest.status !== "accepted") {
    return { status: "never_accepted", latest };
  }
  if (latest.version !== currentVersion) {
    return { status: "outdated", latest };
  }
  return { status: "current", latest };
}

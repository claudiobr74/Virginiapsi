"use server";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import {
  CONSENT_TYPE_LABELS,
  MINIMAL_CONSENT_VERSION,
  recordConsentSchema,
} from "@/features/consents/contracts";
import { requireOrgContext } from "@/lib/auth/require-org-context";
import { logAuditEvent } from "@/lib/audit/log-audit-event";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface ConsentActionResult {
  error?: string;
  consentId?: string;
}

/** Hashed so the raw address never lands in the database (LGPD minimization). */
async function acceptanceIpHash(): Promise<string | null> {
  const headerList = await headers();
  const forwarded = headerList.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim();
  if (!ip) {
    return null;
  }
  return createHash("sha256").update(ip).digest("hex");
}

export async function recordConsentAction(
  input: unknown,
): Promise<ConsentActionResult> {
  const { organizationId, role } = await requireOrgContext();

  if (role !== "psychologist_admin") {
    return { error: "Apenas a psicóloga administradora registra consentimentos." };
  }

  const parsed = recordConsentSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("consents")
    .insert({
      organization_id: organizationId,
      patient_id: parsed.data.patientId,
      type: parsed.data.type,
      title: CONSENT_TYPE_LABELS[parsed.data.type],
      version: MINIMAL_CONSENT_VERSION,
      status: "accepted",
      accepted_ip_hash: await acceptanceIpHash(),
      guardian_authorization: parsed.data.guardianAuthorization,
      guardian_name: parsed.data.guardianName || null,
      patient_assent: parsed.data.patientAssent,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { error: "Não foi possível registrar o consentimento agora." };
  }

  await logAuditEvent({
    organizationId,
    action: "consent.record",
    resourceType: "consent",
    resourceId: data.id as string,
    metadata: { type: parsed.data.type, version: MINIMAL_CONSENT_VERSION },
  });

  revalidatePath(`/app/patients/${parsed.data.patientId}`);
  return { consentId: data.id as string };
}

/**
 * Revocation is a status transition, never a delete: the record that a consent
 * once existed and was withdrawn is itself part of the clinical/legal history.
 */
export async function revokeConsentAction(
  consentId: string,
  patientId: string,
): Promise<ConsentActionResult> {
  const { organizationId, role } = await requireOrgContext();

  if (role !== "psychologist_admin") {
    return { error: "Apenas a psicóloga administradora revoga consentimentos." };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("consents")
    .update({ status: "revoked" })
    .eq("id", consentId)
    .eq("organization_id", organizationId)
    .select("id, type")
    .single();

  if (error || !data) {
    return { error: "Não foi possível revogar o consentimento agora." };
  }

  await logAuditEvent({
    organizationId,
    action: "consent.revoke",
    resourceType: "consent",
    resourceId: consentId,
    metadata: { type: data.type as string },
  });

  revalidatePath(`/app/patients/${patientId}`);
  return { consentId };
}

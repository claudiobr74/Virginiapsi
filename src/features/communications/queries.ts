import "server-only";

import {
  inboundRowSchema,
  messageRowSchema,
  outboxRowSchema,
  preferenceRowSchema,
  templateRowSchema,
  type PatientWhatsAppSnapshot,
} from "@/features/communications/contracts";
import { normalizeE164 } from "@/lib/integrations/twilio/e164";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function getPatientWhatsAppSnapshot(
  organizationId: string,
  patientId: string,
  patientPhone: string | null,
): Promise<PatientWhatsAppSnapshot> {
  const supabase = await createSupabaseServerClient();

  const [
    preferenceResult,
    consentsResult,
    templatesResult,
    outboxResult,
    messagesResult,
    inboundResult,
    allowedResult,
  ] = await Promise.all([
    supabase
      .from("communication_preferences")
      .select(
        "patient_id, organization_id, whatsapp_enabled, consent_id, quiet_hours_start, quiet_hours_end",
      )
      .eq("organization_id", organizationId)
      .eq("patient_id", patientId)
      .maybeSingle(),
    supabase
      .from("consents")
      .select("id, status")
      .eq("organization_id", organizationId)
      .eq("patient_id", patientId)
      .eq("type", "whatsapp")
      .eq("status", "accepted")
      .order("created_at", { ascending: false })
      .limit(1),
    supabase
      .from("whatsapp_templates")
      .select("id, organization_id, template_key, body, twilio_content_sid")
      .eq("organization_id", organizationId)
      .order("template_key"),
    supabase
      .from("whatsapp_reminder_outbox")
      .select(
        "id, appointment_id, reminder_type, scheduled_for, state, attempt_count, last_error_code, sent_at",
      )
      .eq("organization_id", organizationId)
      .eq("patient_id", patientId)
      .order("scheduled_for", { ascending: true }),
    supabase
      .from("whatsapp_messages")
      .select("id, template_key, status, to_number, sent_at, created_at, body_redacted")
      .eq("organization_id", organizationId)
      .eq("patient_id", patientId)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("whatsapp_inbound_messages")
      .select("id, intent, processed, created_at, body_redacted")
      .eq("organization_id", organizationId)
      .eq("patient_id", patientId)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase.rpc("patient_whatsapp_allowed", {
      p_org_id: organizationId,
      p_patient_id: patientId,
    }),
  ]);

  if (preferenceResult.error) {
    throw new Error(`failed to load whatsapp preference: ${preferenceResult.error.message}`);
  }
  if (consentsResult.error) {
    throw new Error(`failed to load whatsapp consent: ${consentsResult.error.message}`);
  }
  if (templatesResult.error) {
    throw new Error(`failed to load whatsapp templates: ${templatesResult.error.message}`);
  }
  if (outboxResult.error) {
    throw new Error(`failed to load whatsapp outbox: ${outboxResult.error.message}`);
  }
  if (messagesResult.error) {
    throw new Error(`failed to load whatsapp messages: ${messagesResult.error.message}`);
  }
  if (inboundResult.error) {
    throw new Error(`failed to load whatsapp inbound: ${inboundResult.error.message}`);
  }

  const accepted = (consentsResult.data ?? [])[0] as { id: string } | undefined;

  return {
    preference: preferenceResult.data
      ? preferenceRowSchema.parse(preferenceResult.data)
      : null,
    hasWhatsappConsent: Boolean(accepted),
    whatsappConsentId: accepted?.id ?? null,
    allowed: Boolean(allowedResult.data),
    phoneE164: normalizeE164(patientPhone),
    templates: templateRowSchema.array().parse(templatesResult.data ?? []),
    outbox: outboxRowSchema.array().parse(outboxResult.data ?? []),
    messages: messageRowSchema.array().parse(messagesResult.data ?? []),
    inbound: inboundRowSchema.array().parse(inboundResult.data ?? []),
  };
}

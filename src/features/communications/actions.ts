"use server";

import { revalidatePath } from "next/cache";
import { CONSENT_TYPE_LABELS, MINIMAL_CONSENT_VERSION } from "@/features/consents/contracts";
import {
  sendMessageSchema,
  setPreferenceSchema,
} from "@/features/communications/contracts";
import { TEMPLATE_KEYS, type TemplateKey, renderTemplate } from "@/features/communications/templates";
import { requireOrgContext } from "@/lib/auth/require-org-context";
import { logAuditEvent } from "@/lib/audit/log-audit-event";
import { getServerEnv } from "@/lib/env/server";
import {
  isTwilioOperational,
  TWILIO_DISABLED_USER_MESSAGE,
} from "@/lib/integrations/twilio/enabled";
import { TwilioApiError, TwilioMessagingClient } from "@/lib/integrations/twilio/client";
import { normalizeE164, toWhatsAppAddress } from "@/lib/integrations/twilio/e164";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatInTimeZone } from "@/lib/utils/timezone";

export interface CommunicationActionResult {
  error?: string;
}

function revalidatePatient(patientId: string) {
  revalidatePath(`/app/patients/${patientId}`);
  revalidatePath("/app");
}

function mapSendError(message: string): string {
  if (/whatsapp preference requires/i.test(message) || /P0001/.test(message)) {
    return "Registre o consentimento de WhatsApp antes de ativar o canal.";
  }
  if (/row-level security/i.test(message)) {
    return "Sem permissão para alterar as preferências de comunicação.";
  }
  if (/missing_from/i.test(message)) {
    return "WhatsApp não está configurado (remetente ou Messaging Service).";
  }
  return "Não foi possível concluir o envio agora.";
}

export async function recordWhatsappConsentAction(
  patientId: string,
): Promise<CommunicationActionResult> {
  const { organizationId } = await requireOrgContext();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("consents")
    .insert({
      organization_id: organizationId,
      patient_id: patientId,
      type: "whatsapp",
      title: CONSENT_TYPE_LABELS.whatsapp,
      version: MINIMAL_CONSENT_VERSION,
      status: "accepted",
    })
    .select("id")
    .single();

  if (error || !data) {
    return { error: "Não foi possível registrar o consentimento de WhatsApp." };
  }

  await logAuditEvent({
    organizationId,
    action: "consent.record",
    resourceType: "consent",
    resourceId: data.id as string,
    metadata: { type: "whatsapp", version: MINIMAL_CONSENT_VERSION },
  });

  revalidatePatient(patientId);
  return {};
}

export async function revokeWhatsappConsentAction(
  consentId: string,
  patientId: string,
): Promise<CommunicationActionResult> {
  const { organizationId } = await requireOrgContext();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("consents")
    .update({ status: "revoked" })
    .eq("id", consentId)
    .eq("organization_id", organizationId)
    .eq("type", "whatsapp")
    .select("id")
    .single();

  if (error || !data) {
    return { error: "Não foi possível revogar o consentimento de WhatsApp." };
  }

  await supabase
    .from("communication_preferences")
    .update({ whatsapp_enabled: false })
    .eq("patient_id", patientId)
    .eq("organization_id", organizationId);

  await logAuditEvent({
    organizationId,
    action: "consent.revoke",
    resourceType: "consent",
    resourceId: consentId,
    metadata: { type: "whatsapp" },
  });

  revalidatePatient(patientId);
  return {};
}

export async function setWhatsappPreferenceAction(
  input: unknown,
): Promise<CommunicationActionResult> {
  const { organizationId } = await requireOrgContext();
  const parsed = setPreferenceSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createSupabaseServerClient();
  const { error: ensureError } = await supabase.rpc("ensure_whatsapp_templates", {
    p_org_id: organizationId,
  });
  if (ensureError) {
    return { error: "Não foi possível preparar os modelos de WhatsApp." };
  }

  let consentId: string | null = null;
  if (parsed.data.enabled) {
    const { data: consents } = await supabase
      .from("consents")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("patient_id", parsed.data.patientId)
      .eq("type", "whatsapp")
      .eq("status", "accepted")
      .order("created_at", { ascending: false })
      .limit(1);
    consentId = (consents?.[0] as { id: string } | undefined)?.id ?? null;
    if (!consentId) {
      return { error: "Registre o consentimento de WhatsApp antes de ativar o canal." };
    }
  }

  const { error } = await supabase.from("communication_preferences").upsert(
    {
      patient_id: parsed.data.patientId,
      organization_id: organizationId,
      whatsapp_enabled: parsed.data.enabled,
      consent_id: consentId,
    },
    { onConflict: "patient_id" },
  );

  if (error) {
    return { error: mapSendError(error.message) };
  }

  await logAuditEvent({
    organizationId,
    action: parsed.data.enabled ? "whatsapp.preference.enable" : "whatsapp.preference.disable",
    resourceType: "patient",
    resourceId: parsed.data.patientId,
  });

  revalidatePatient(parsed.data.patientId);
  return {};
}

async function loadTemplateBody(
  organizationId: string,
  templateKey: TemplateKey,
): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  await supabase.rpc("ensure_whatsapp_templates", { p_org_id: organizationId });
  const { data } = await supabase
    .from("whatsapp_templates")
    .select("body")
    .eq("organization_id", organizationId)
    .eq("template_key", templateKey)
    .maybeSingle();
  return (data?.body as string | undefined) ?? null;
}

function formatStartsAt(iso: string, timezone: string): string {
  return formatInTimeZone(iso, timezone, {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export async function sendWhatsappTemplateAction(
  input: unknown,
): Promise<CommunicationActionResult> {
  const env = getServerEnv();
  if (!isTwilioOperational(env)) {
    return { error: TWILIO_DISABLED_USER_MESSAGE };
  }
  const { organizationId, timezone } = await requireOrgContext();
  const parsed = sendMessageSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  if (!TEMPLATE_KEYS.includes(parsed.data.templateKey)) {
    return { error: "Modelo inválido." };
  }

  const supabase = await createSupabaseServerClient();
  const { data: allowed } = await supabase.rpc("patient_whatsapp_allowed", {
    p_org_id: organizationId,
    p_patient_id: parsed.data.patientId,
  });
  if (!allowed) {
    return { error: "WhatsApp não está habilitado para este paciente." };
  }

  const { data: patient, error: patientError } = await supabase
    .from("patients")
    .select("id, preferred_name, phone")
    .eq("id", parsed.data.patientId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (patientError || !patient) {
    return { error: "Paciente não encontrado." };
  }

  const e164 = normalizeE164(patient.phone as string | null);
  if (!e164) {
    return { error: "Cadastre um telefone válido (E.164) para enviar WhatsApp." };
  }

  let appointmentId = parsed.data.appointmentId ?? null;
  let startsAt: string | null = null;
  if (parsed.data.templateKey === "confirmation" || parsed.data.templateKey === "reminder_24h" || parsed.data.templateKey === "reminder_2h") {
    if (appointmentId) {
      const { data: appointment } = await supabase
        .from("appointments")
        .select("id, starts_at")
        .eq("id", appointmentId)
        .eq("organization_id", organizationId)
        .eq("patient_id", parsed.data.patientId)
        .maybeSingle();
      startsAt = (appointment?.starts_at as string | undefined) ?? null;
      if (!startsAt) {
        return { error: "Consulta não encontrada para este paciente." };
      }
    } else {
      const { data: upcoming } = await supabase
        .from("appointments")
        .select("id, starts_at")
        .eq("organization_id", organizationId)
        .eq("patient_id", parsed.data.patientId)
        .eq("origin", "TESSELI")
        .in("status", ["scheduled", "confirmed"])
        .gt("starts_at", new Date().toISOString())
        .order("starts_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      appointmentId = (upcoming?.id as string | undefined) ?? null;
      startsAt = (upcoming?.starts_at as string | undefined) ?? null;
      if (parsed.data.templateKey === "confirmation" && !appointmentId) {
        return { error: "Não há consulta futura para confirmar." };
      }
    }
  }

  const templateBody = await loadTemplateBody(organizationId, parsed.data.templateKey);
  if (!templateBody) {
    return { error: "Modelo de mensagem não encontrado." };
  }

  if (!env.TWILIO_WHATSAPP_FROM && !env.TWILIO_MESSAGING_SERVICE_SID) {
    return { error: "WhatsApp não está configurado (remetente ou Messaging Service)." };
  }

  const body = renderTemplate(templateBody, {
    patientName: patient.preferred_name as string,
    startsAt: startsAt ? formatStartsAt(startsAt, timezone) : undefined,
  });

  const idempotencyKey = [
    parsed.data.templateKey,
    parsed.data.patientId,
    appointmentId ?? "none",
    new Date().toISOString().slice(0, 13),
  ].join(":");

  const { data: inserted, error: insertError } = await supabase
    .from("whatsapp_messages")
    .insert({
      organization_id: organizationId,
      patient_id: parsed.data.patientId,
      appointment_id: appointmentId,
      direction: "outbound",
      template_key: parsed.data.templateKey,
      status: "queued",
      to_number: e164,
      body_redacted: parsed.data.templateKey,
      idempotency_key: idempotencyKey,
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    if (/duplicate key|unique/i.test(insertError?.message ?? "")) {
      return { error: "Esta mensagem já foi enviada recentemente (idempotência)." };
    }
    return { error: "Não foi possível registrar o envio." };
  }

  const client = new TwilioMessagingClient();
  try {
    const result = await client.send({
      accountSid: env.TWILIO_ACCOUNT_SID,
      authToken: env.TWILIO_AUTH_TOKEN,
      to: toWhatsAppAddress(e164),
      body,
      from: env.TWILIO_WHATSAPP_FROM,
      messagingServiceSid: env.TWILIO_MESSAGING_SERVICE_SID,
      statusCallback: `${env.NEXT_PUBLIC_APP_URL}/api/webhooks/twilio/status`,
      idempotencyKey,
    });
    await supabase
      .from("whatsapp_messages")
      .update({
        message_sid: result.sid,
        status: result.status,
        sent_at: new Date().toISOString(),
      })
      .eq("id", inserted.id);
  } catch (error) {
    const code =
      error instanceof TwilioApiError ? error.code ?? String(error.status) : "send_failed";
    await supabase
      .from("whatsapp_messages")
      .update({ status: "failed", body_redacted: parsed.data.templateKey })
      .eq("id", inserted.id);
    return { error: mapSendError(String(code)) };
  }

  await logAuditEvent({
    organizationId,
    action: "whatsapp.send",
    resourceType: "patient",
    resourceId: parsed.data.patientId,
    metadata: { template: parsed.data.templateKey },
  });

  revalidatePatient(parsed.data.patientId);
  return {};
}

import "server-only";

import { communicationsAdmin } from "@/features/communications/admin-store";
import { parseInboundIntent } from "@/features/communications/templates";
import { normalizeE164 } from "@/lib/integrations/twilio/e164";
import { shouldApplyTwilioStatus } from "@/lib/integrations/twilio/status";

export async function applyTwilioStatusCallback(params: Record<string, string>): Promise<"applied" | "duplicate" | "ignored"> {
  const messageSid = params.MessageSid ?? params.SmsSid;
  const nextStatus = params.MessageStatus ?? params.SmsStatus;
  if (!messageSid || !nextStatus) {
    return "ignored";
  }

  const admin = communicationsAdmin();
  const { data: existing } = await admin
    .from("whatsapp_messages")
    .select("id, status, outbox_id")
    .eq("message_sid", messageSid)
    .maybeSingle();

  if (!existing) {
    return "ignored";
  }
  if (!shouldApplyTwilioStatus(existing.status as string, nextStatus)) {
    return "duplicate";
  }

  await admin
    .from("whatsapp_messages")
    .update({ status: nextStatus })
    .eq("id", existing.id);

  if (existing.outbox_id && (nextStatus === "failed" || nextStatus === "undelivered")) {
    await admin.rpc("mark_whatsapp_outbox_failed", {
      p_id: existing.outbox_id,
      p_retryable: false,
      p_error_code: params.ErrorCode || nextStatus,
    });
  }

  return "applied";
}

export async function applyTwilioInbound(params: Record<string, string>): Promise<"applied" | "duplicate" | "ignored"> {
  const messageSid = params.MessageSid ?? params.SmsSid;
  const from = params.From;
  if (!messageSid || !from) {
    return "ignored";
  }

  const admin = communicationsAdmin();
  const { data: existing } = await admin
    .from("whatsapp_inbound_messages")
    .select("id")
    .eq("message_sid", messageSid)
    .maybeSingle();

  if (existing) {
    return "duplicate";
  }

  const e164 = normalizeE164(from);
  const intent = parseInboundIntent(params.Body);
  let organizationId: string | null = null;
  let patientId: string | null = null;
  let appointmentId: string | null = null;

  if (e164) {
    const { data: matches } = await admin.rpc("match_patients_by_whatsapp_e164", {
      p_e164: e164,
    });
    const rows = (matches ?? []) as Array<{ organization_id: string; patient_id: string }>;
    if (rows.length === 1) {
      organizationId = rows[0].organization_id;
      patientId = rows[0].patient_id;
    }
  }

  if (patientId && organizationId && intent === "confirm") {
    const { data: upcoming } = await admin
      .from("appointments")
      .select("id, status")
      .eq("organization_id", organizationId)
      .eq("patient_id", patientId)
      .eq("origin", "TESSELI")
      .in("status", ["scheduled", "confirmed"])
      .gt("starts_at", new Date().toISOString())
      .order("starts_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    appointmentId = (upcoming?.id as string | undefined) ?? null;
    if (upcoming && upcoming.status === "scheduled") {
      await admin
        .from("appointments")
        .update({ status: "confirmed" })
        .eq("id", upcoming.id)
        .eq("status", "scheduled");
    }
  }

  const { error } = await admin.from("whatsapp_inbound_messages").insert({
    organization_id: organizationId,
    patient_id: patientId,
    appointment_id: appointmentId,
    message_sid: messageSid,
    from_number: e164 ?? from,
    body_redacted: intent,
    processed: intent !== "unknown",
    intent,
  });

  if (error) {
    if (/duplicate key|unique/i.test(error.message)) {
      return "duplicate";
    }
    throw new Error("failed to persist inbound whatsapp");
  }

  return "applied";
}

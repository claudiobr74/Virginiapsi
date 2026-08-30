import "server-only";

import { communicationsAdmin } from "@/features/communications/admin-store";
import { renderTemplate, type TemplateKey } from "@/features/communications/templates";
import { getServerEnv } from "@/lib/env/server";
import { isTwilioOperational } from "@/lib/integrations/twilio/enabled";
import { TwilioApiError, TwilioMessagingClient } from "@/lib/integrations/twilio/client";
import { normalizeE164, toWhatsAppAddress } from "@/lib/integrations/twilio/e164";
import { formatInTimeZone } from "@/lib/utils/timezone";

interface ClaimedOutbox {
  id: string;
  organization_id: string;
  appointment_id: string;
  patient_id: string;
  reminder_type: "reminder_24h" | "reminder_2h";
  attempt_count: number;
}

export interface ReminderJobResult {
  claimed: number;
  sent: number;
  failed: number;
  skipped: number;
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

export async function processDueWhatsappReminders(
  client: TwilioMessagingClient = new TwilioMessagingClient(),
): Promise<ReminderJobResult> {
  const env = getServerEnv();
  if (!isTwilioOperational(env)) {
    return { claimed: 0, sent: 0, failed: 0, skipped: 0 };
  }
  const admin = communicationsAdmin();
  const { data: claimed, error } = await admin.rpc("claim_due_whatsapp_reminders", {
    p_limit: 20,
  });

  if (error) {
    throw new Error(`failed to claim whatsapp reminders: ${error.message}`);
  }

  const rows = (claimed ?? []) as ClaimedOutbox[];
  const result: ReminderJobResult = {
    claimed: rows.length,
    sent: 0,
    failed: 0,
    skipped: 0,
  };

  if (rows.length === 0) {
    return result;
  }

  if (!env.TWILIO_WHATSAPP_FROM && !env.TWILIO_MESSAGING_SERVICE_SID) {
    for (const row of rows) {
      await admin.rpc("mark_whatsapp_outbox_failed", {
        p_id: row.id,
        p_retryable: true,
        p_error_code: "missing_from",
      });
      result.failed += 1;
    }
    return result;
  }

  for (const row of rows) {
    const { data: allowed } = await admin.rpc("patient_whatsapp_allowed", {
      p_org_id: row.organization_id,
      p_patient_id: row.patient_id,
    });
    if (!allowed) {
      await admin.rpc("mark_whatsapp_outbox_failed", {
        p_id: row.id,
        p_retryable: false,
        p_error_code: "consent_or_preference",
      });
      result.skipped += 1;
      continue;
    }

    const [{ data: patient }, { data: appointment }, { data: organization }] = await Promise.all([
      admin
        .from("patients")
        .select("preferred_name, phone")
        .eq("id", row.patient_id)
        .maybeSingle(),
      admin
        .from("appointments")
        .select("starts_at, status, origin")
        .eq("id", row.appointment_id)
        .maybeSingle(),
      admin.from("organizations").select("timezone").eq("id", row.organization_id).maybeSingle(),
    ]);

    if (
      !appointment ||
      appointment.origin !== "TESSELI" ||
      appointment.status === "cancelled" ||
      appointment.status === "completed"
    ) {
      await admin
        .from("whatsapp_reminder_outbox")
        .update({ state: "canceled" })
        .eq("id", row.id);
      result.skipped += 1;
      continue;
    }

    const e164 = normalizeE164(patient?.phone as string | null);
    if (!e164 || !patient) {
      await admin.rpc("mark_whatsapp_outbox_failed", {
        p_id: row.id,
        p_retryable: false,
        p_error_code: "invalid_phone",
      });
      result.skipped += 1;
      continue;
    }

    const templateKey = row.reminder_type as TemplateKey;
    await admin.rpc("ensure_whatsapp_templates", { p_org_id: row.organization_id });
    const { data: template } = await admin
      .from("whatsapp_templates")
      .select("body")
      .eq("organization_id", row.organization_id)
      .eq("template_key", templateKey)
      .maybeSingle();

    if (!template?.body) {
      await admin.rpc("mark_whatsapp_outbox_failed", {
        p_id: row.id,
        p_retryable: true,
        p_error_code: "missing_template",
      });
      result.failed += 1;
      continue;
    }

    const timezone = (organization?.timezone as string | undefined) ?? "America/Sao_Paulo";
    const body = renderTemplate(template.body as string, {
      patientName: patient.preferred_name as string,
      startsAt: formatStartsAt(appointment.starts_at as string, timezone),
    });
    const idempotencyKey = `outbox:${row.id}`;

    await admin.rpc("mark_whatsapp_outbox_sending", { p_id: row.id });

    await admin.from("whatsapp_messages").upsert(
      {
        organization_id: row.organization_id,
        patient_id: row.patient_id,
        appointment_id: row.appointment_id,
        outbox_id: row.id,
        direction: "outbound",
        template_key: templateKey,
        status: "queued",
        to_number: e164,
        scheduled_for: null,
        body_redacted: templateKey,
        idempotency_key: idempotencyKey,
      },
      { onConflict: "organization_id,idempotency_key" },
    );

    try {
      const sent = await client.send({
        accountSid: env.TWILIO_ACCOUNT_SID,
        authToken: env.TWILIO_AUTH_TOKEN,
        to: toWhatsAppAddress(e164),
        body,
        from: env.TWILIO_WHATSAPP_FROM,
        messagingServiceSid: env.TWILIO_MESSAGING_SERVICE_SID,
        statusCallback: `${env.NEXT_PUBLIC_APP_URL}/api/webhooks/twilio/status`,
        idempotencyKey,
      });
      await admin.rpc("mark_whatsapp_outbox_sent", { p_id: row.id, p_sid: sent.sid });
      await admin
        .from("whatsapp_messages")
        .update({
          message_sid: sent.sid,
          status: sent.status,
          sent_at: new Date().toISOString(),
        })
        .eq("organization_id", row.organization_id)
        .eq("idempotency_key", idempotencyKey);
      result.sent += 1;
    } catch (error) {
      const retryable = error instanceof TwilioApiError ? error.retryable : true;
      const code =
        error instanceof TwilioApiError ? error.code ?? String(error.status) : "send_failed";
      await admin.rpc("mark_whatsapp_outbox_failed", {
        p_id: row.id,
        p_retryable: retryable,
        p_error_code: code,
      });
      result.failed += 1;
    }
  }

  return result;
}

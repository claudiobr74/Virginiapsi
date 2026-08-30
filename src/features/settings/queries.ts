import "server-only";

import { getConnection } from "@/features/calendar/connection-queries";
import {
  defaultPracticeSettings,
  logicalExportRowSchema,
  practiceSettingsRowSchema,
  teamMemberRowSchema,
  type LogicalExportRow,
  type PracticeSettingsRow,
  type SettingsSnapshot,
  type TeamMemberRow,
} from "@/features/settings/contracts";
import { buildIntegrationDiagnostics } from "@/features/settings/diagnostics";
import { buildEliminationReport } from "@/features/settings/elimination";
import { readIntegrationEnvFlags } from "@/lib/env/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function getPracticeSettings(
  organizationId: string,
): Promise<PracticeSettingsRow | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("practice_settings")
    .select("*")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) {
    return null;
  }
  const parsed = practiceSettingsRowSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

export async function listTeamMembers(organizationId: string): Promise<TeamMemberRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("list_organization_members", {
    p_org_id: organizationId,
  });
  if (error) {
    return [];
  }
  const parsed = teamMemberRowSchema.array().safeParse(data ?? []);
  return parsed.success ? parsed.data : [];
}

export async function listLogicalExports(
  organizationId: string,
): Promise<LogicalExportRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("logical_exports")
    .select("*")
    .eq("organization_id", organizationId)
    .order("requested_at", { ascending: false })
    .limit(20);
  if (error) {
    return [];
  }
  const parsed = logicalExportRowSchema.array().safeParse(data ?? []);
  return parsed.success ? parsed.data : [];
}

export async function getLogicalExport(
  organizationId: string,
  exportId: string,
): Promise<LogicalExportRow | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("logical_exports")
    .select("*")
    .eq("id", exportId)
    .maybeSingle();
  if (error) {
    throw new Error(`failed to load export: ${error.message}`);
  }
  if (!data) {
    return null;
  }
  const row = logicalExportRowSchema.parse(data);
  return row.organization_id === organizationId ? row : null;
}

async function lastTwilioError(organizationId: string): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("whatsapp_reminder_outbox")
    .select("last_error_code")
    .eq("organization_id", organizationId)
    .not("last_error_code", "is", null)
    .order("updated_at", { ascending: false })
    .limit(1);
  const code = data?.[0]?.last_error_code;
  return typeof code === "string" ? code : null;
}

export async function getIntegrationDiagnosticsForOrg(organizationId: string) {
  const flags = readIntegrationEnvFlags();
  const [connection, twilioError] = await Promise.all([
    getConnection(organizationId).catch(() => null),
    lastTwilioError(organizationId).catch(() => null),
  ]);

  return buildIntegrationDiagnostics({
    google: {
      oauthConfigured: flags.googleOAuth,
      connectionStatus: connection?.status ?? null,
      accountEmail: connection?.google_account_email ?? null,
      lastSyncedAt: connection?.last_synced_at ?? null,
      lastError: connection?.last_sync_error ?? null,
    },
    twilio: {
      enabled: flags.twilioEnabled,
      accountConfigured: flags.twilioAccount,
      senderConfigured: flags.twilioSender,
      lastError: twilioError,
    },
    transcription: {
      localDefault: true,
      fallbackConfigured: flags.groq,
    },
    gemini: {
      configured: flags.gemini,
    },
  });
}

export async function listPresentEliminationClasses(
  organizationId: string,
  patientId: string,
): Promise<string[]> {
  const supabase = await createSupabaseServerClient();
  const present: string[] = ["patient_identifiers"];

  const [
    patient,
    profiles,
    sessions,
    consents,
    charges,
    plans,
    attachments,
    documents,
    prefs,
    aiRuns,
    exports,
  ] = await Promise.all([
    supabase
      .from("patients")
      .select("photo_path")
      .eq("id", patientId)
      .maybeSingle(),
    supabase
      .from("patient_clinical_profile")
      .select("patient_id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("patient_id", patientId),
    supabase
      .from("clinical_sessions")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("patient_id", patientId),
    supabase
      .from("consents")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("patient_id", patientId),
    supabase
      .from("financial_charges")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("patient_id", patientId),
    supabase
      .from("financial_plans")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("patient_id", patientId),
    supabase
      .from("patient_attachments")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("patient_id", patientId),
    supabase
      .from("documents")
      .select("id, status")
      .eq("organization_id", organizationId)
      .eq("patient_id", patientId),
    supabase
      .from("communication_preferences")
      .select("patient_id", { count: "exact", head: true })
      .eq("patient_id", patientId),
    supabase
      .from("ai_runs")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("patient_id", patientId),
    supabase
      .from("logical_exports")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("patient_id", patientId),
  ]);

  if (patient.data?.photo_path) present.push("patient_photo");
  if ((profiles.count ?? 0) > 0) present.push("patient_clinical_profile");
  const sessionIds = (sessions.data ?? []).map((row) => row.id as string);
  if (sessionIds.length > 0) {
    present.push("clinical_sessions");
    const [{ count: dpepCount }, { count: transcriptCount }] = await Promise.all([
      supabase
        .from("session_dpep")
        .select("session_id", { count: "exact", head: true })
        .in("session_id", sessionIds),
      supabase
        .from("session_transcript_segments")
        .select("id", { count: "exact", head: true })
        .in("session_id", sessionIds),
    ]);
    if ((dpepCount ?? 0) > 0) present.push("session_dpep");
    if ((transcriptCount ?? 0) > 0) present.push("session_transcript_segments");
  }
  if ((consents.count ?? 0) > 0) present.push("consents", "consent_files");
  if ((charges.count ?? 0) > 0) present.push("financial_charges_payments");
  if ((plans.count ?? 0) > 0) present.push("financial_plans");
  if ((attachments.count ?? 0) > 0) present.push("patient_attachments");
  const docs = documents.data ?? [];
  if (docs.some((row) => row.status === "draft")) present.push("documents_draft");
  if (docs.some((row) => row.status !== "draft")) present.push("documents_issued");
  if ((prefs.count ?? 0) > 0) present.push("communication_preferences");
  if ((aiRuns.count ?? 0) > 0) present.push("ai_runs_artifacts");
  if ((exports.count ?? 0) > 0) present.push("logical_exports");
  present.push("audit_events");
  return present;
}

export async function previewPatientElimination(
  organizationId: string,
  patient: { public_code: string; preferred_name: string; id: string },
) {
  const presentClasses = await listPresentEliminationClasses(organizationId, patient.id);
  return buildEliminationReport({
    publicCode: patient.public_code,
    preferredName: patient.preferred_name,
    presentClasses,
  });
}

export async function getSettingsSnapshot(input: {
  organizationId: string;
  organizationName: string;
  timezone: string;
  email: string;
  fullName: string;
  slug?: string;
}): Promise<SettingsSnapshot> {
  const emptyDiagnostics = () =>
    buildIntegrationDiagnostics({
      google: {
        oauthConfigured: false,
        connectionStatus: null,
        accountEmail: null,
        lastSyncedAt: null,
        lastError: null,
      },
      twilio: {
        enabled: false,
        accountConfigured: false,
        senderConfigured: false,
        lastError: null,
      },
      transcription: { localDefault: true, fallbackConfigured: false },
      gemini: { configured: false },
    });

  try {
    const supabase = await createSupabaseServerClient();
    const [{ data: org }, practice, team, diagnostics, exports, patients] =
      await Promise.all([
        supabase
          .from("organizations")
          .select("id, name, slug, timezone, status")
          .eq("id", input.organizationId)
          .maybeSingle(),
        getPracticeSettings(input.organizationId),
        listTeamMembers(input.organizationId),
        getIntegrationDiagnosticsForOrg(input.organizationId),
        listLogicalExports(input.organizationId),
        supabase
          .from("patients")
          .select("id, preferred_name, public_code")
          .eq("organization_id", input.organizationId)
          .order("preferred_name", { ascending: true }),
      ]);

    const practiceRow = practice ?? defaultPracticeSettings(input.organizationId);

    return {
      profile: {
        email: input.email,
        fullName: input.fullName,
      },
      organization: {
        id: input.organizationId,
        name: org?.name ?? input.organizationName,
        timezone: org?.timezone ?? input.timezone,
        slug: org?.slug ?? input.slug ?? "",
      },
      practice: practiceRow,
      team,
      diagnostics,
      exports,
      patients: (patients.data ?? []).map((patient) => ({
        id: patient.id as string,
        preferred_name: patient.preferred_name as string,
        public_code: patient.public_code as string,
      })),
      secretaryFinanceAccess: practiceRow.secretary_finance_access,
    };
  } catch {
    const practiceRow = defaultPracticeSettings(input.organizationId);
    return {
      profile: {
        email: input.email,
        fullName: input.fullName,
      },
      organization: {
        id: input.organizationId,
        name: input.organizationName,
        timezone: input.timezone,
        slug: input.slug ?? "",
      },
      practice: practiceRow,
      team: [],
      diagnostics: emptyDiagnostics(),
      exports: [],
      patients: [],
      secretaryFinanceAccess: practiceRow.secretary_finance_access,
    };
  }
}

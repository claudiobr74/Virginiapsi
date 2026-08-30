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
import { buildEliminationReport, type EliminationCounts } from "@/features/settings/elimination";
import { readIntegrationEnvFlags } from "@/lib/env/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getDocumentBranding, listDocumentLogos } from "@/features/documents/branding-queries";

function emptyNumber(value: unknown): number {
  return typeof value === "number" ? value : Number(value ?? 0);
}

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

  const googleLive =
    connection?.status === "connected" || connection?.status === "error";

  return {
    connection,
    diagnostics: buildIntegrationDiagnostics({
      google: {
        oauthConfigured: flags.googleOAuth,
        connectionStatus: connection?.status ?? null,
        accountEmail: googleLive ? connection?.google_account_email ?? null : null,
        lastSyncedAt: googleLive ? connection?.last_synced_at ?? null : null,
        lastError: googleLive ? connection?.last_sync_error ?? null : null,
      },
      twilio: {
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
    }),
  };
}

export async function countEliminationRecords(
  organizationId: string,
  patientId: string,
): Promise<EliminationCounts> {
  const supabase = await createSupabaseServerClient();
  const [sessions, profiles, consents, charges, transcripts] = await Promise.all([
    supabase
      .from("clinical_sessions")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("patient_id", patientId),
    supabase
      .from("patient_clinical_profile")
      .select("patient_id", { count: "exact", head: true })
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
      .from("session_transcript_segments")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId),
  ]);

  // Transcripts do not carry patient_id — count via the patient's sessions.
  let transcriptCount = 0;
  if ((sessions.count ?? 0) > 0) {
    const { data: sessionRows } = await supabase
      .from("clinical_sessions")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("patient_id", patientId);
    const ids = (sessionRows ?? []).map((row) => row.id as string);
    if (ids.length > 0) {
      const { count } = await supabase
        .from("session_transcript_segments")
        .select("id", { count: "exact", head: true })
        .in("session_id", ids);
      transcriptCount = count ?? 0;
    }
  } else {
    transcriptCount = 0;
  }

  void transcripts;

  return {
    clinicalSessions: emptyNumber(sessions.count),
    clinicalProfiles: emptyNumber(profiles.count),
    consents: emptyNumber(consents.count),
    financialCharges: emptyNumber(charges.count),
    transcriptSegments: transcriptCount,
  };
}

export async function previewPatientElimination(
  organizationId: string,
  patient: { public_code: string; preferred_name: string; id: string },
) {
  const counts = await countEliminationRecords(organizationId, patient.id);
  return buildEliminationReport({
    publicCode: patient.public_code,
    preferredName: patient.preferred_name,
    counts,
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
        accountConfigured: false,
        senderConfigured: false,
        lastError: null,
      },
      transcription: { localDefault: true, fallbackConfigured: false },
      gemini: { configured: false },
    });

  try {
    const supabase = await createSupabaseServerClient();
    const [{ data: org }, practice, team, integration, exports, patients, documentBranding, documentLogos] =
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
        getDocumentBranding(input.organizationId).catch(() => null),
        listDocumentLogos(input.organizationId).catch(() => []),
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
      diagnostics: integration.diagnostics,
      googleConnection: integration.connection,
      exports,
      patients: (patients.data ?? []).map((patient) => ({
        id: patient.id as string,
        preferred_name: patient.preferred_name as string,
        public_code: patient.public_code as string,
      })),
      secretaryFinanceAccess: practiceRow.secretary_finance_access,
      documentBranding,
      documentLogos,
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
      googleConnection: null,
      exports: [],
      patients: [],
      secretaryFinanceAccess: practiceRow.secretary_finance_access,
      documentBranding: null,
      documentLogos: [],
    };
  }
}
